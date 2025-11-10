import { NextResponse } from "next/server";
import { model } from "@/lib/gemini";
import { webTools } from "@/tools/webSearch";
import { recallMemory, saveCourseSummary } from "@/utils/memory";
import { createServerClient } from "@/utils/supabase-server";

export const maxDuration = 30;

const memoriesCache = new Map<
  string,
  { memories: string; timestamp: number }
>();
const CACHE_TTL = 5 * 60 * 1000;

const messageCountCache = new Map<
  string,
  { count: number; timestamp: number }
>();
const COUNT_CACHE_TTL = 10 * 60 * 1000;

function getCacheKey(courseId: string, userId: string): string {
  return `${userId}_${courseId}`;
}

function getCachedMemories(courseId: string, userId: string): string | null {
  const key = getCacheKey(courseId, userId);
  const cached = memoriesCache.get(key);

  if (!cached) return null;

  const age = Date.now() - cached.timestamp;
  if (age > CACHE_TTL) {
    memoriesCache.delete(key);
    return null;
  }

  return cached.memories;
}

function setCachedMemories(
  courseId: string,
  userId: string,
  memories: string
): void {
  const key = getCacheKey(courseId, userId);
  memoriesCache.set(key, {
    memories,
    timestamp: Date.now(),
  });
}

function invalidateMemoriesCache(courseId: string, userId: string): void {
  const key = getCacheKey(courseId, userId);
  memoriesCache.delete(key);
}

async function getMessageCount(
  courseId: string,
  supabase: any
): Promise<number> {
  const cached = messageCountCache.get(courseId);
  if (cached && Date.now() - cached.timestamp < COUNT_CACHE_TTL) {
    return cached.count;
  }

  const { count } = await supabase
    .from("course_messages")
    .select("*", { count: "exact", head: true })
    .eq("course_id", courseId)
    .eq("role", "user");

  const initialCount = count || 0;
  messageCountCache.set(courseId, {
    count: initialCount,
    timestamp: Date.now(),
  });
  return initialCount;
}

async function incrementMessageCount(
  courseId: string,
  supabase: any
): Promise<number> {
  const cached = messageCountCache.get(courseId);
  const now = Date.now();

  if (cached && now - cached.timestamp < COUNT_CACHE_TTL) {
    const newCount = cached.count + 1;
    messageCountCache.set(courseId, { count: newCount, timestamp: now });
    return newCount;
  } else {
    const currentCount = await getMessageCount(courseId, supabase);
    const newCount = currentCount + 1;
    messageCountCache.set(courseId, { count: newCount, timestamp: now });
    return newCount;
  }
}

function invalidateMessageCountCache(courseId: string): void {
  messageCountCache.delete(courseId);
}

async function loadCourseHistoryFromDatabase(
  courseId: string,
  supabase: any,
  limit: number = 50
): Promise<any[]> {
  try {
    const { data: messages, error } = await supabase
      .from("course_messages")
      .select("role, content, created_at")
      .eq("course_id", courseId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Error loading course history:", error);
      return [];
    }

    if (!messages || messages.length === 0) {
      return [];
    }

    const formattedHistory: any[] = [];

    for (const msg of messages) {
      if (msg.role === "user") {
        formattedHistory.push({ role: "user", parts: [{ text: msg.content }] });
      } else if (msg.role === "assistant") {
        formattedHistory.push({
          role: "model",
          parts: [{ text: msg.content }],
        });
      }
    }

    formattedHistory.reverse();

    if (formattedHistory.length > 0 && formattedHistory[0].role === "model") {
      formattedHistory.unshift({ role: "user", parts: [{ text: "" }] });
    }

    return formattedHistory;
  } catch (error) {
    console.error("Error in loadCourseHistoryFromDatabase:", error);
    return [];
  }
}

async function updateCourseTimestamp(courseId: string, accessToken?: string) {
  try {
    const supabase = await createServerClient(accessToken);
    await supabase
      .from("courses")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", courseId);
  } catch (error) {
    console.error("Error updating course timestamp:", error);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { message, courseId, userId, enableWebSearch = true } = body;

    const url = new URL(req.url);
    const baseUrl = `${url.protocol}//${url.host}`;

    if (
      !message ||
      (message !== "__GREETING__" &&
        message !== "__CONTINUE__" &&
        !message.trim()) ||
      !courseId?.trim() ||
      !userId
    ) {
      console.error("[Chat API] Validation failed:", {
        hasMessage: !!message,
        messageLength: message?.length,
        messageValue: message,
        hasCourseId: !!courseId,
        courseIdValue: courseId,
        hasUserId: !!userId,
        userIdValue: userId,
      });
      return NextResponse.json(
        { error: "Message, course ID, and user ID are required" },
        { status: 400 }
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Authorization token required" },
        { status: 401 }
      );
    }

    const accessToken = authHeader.substring(7);
    const supabase = await createServerClient(accessToken);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(accessToken);

    if (authError || !user) {
      return NextResponse.json(
        { error: "Invalid access token" },
        { status: 401 }
      );
    }

    if (user.id !== userId) {
      return NextResponse.json({ error: "User ID mismatch" }, { status: 403 });
    }

    let validatedUserId = userId;
    const isGreeting = message === "__GREETING__";
    const isContinue = message === "__CONTINUE__";
    const isAssessmentResult = message.startsWith("__ASSESSMENT_RESULT__:");
    const isReadyForRevision = message.startsWith("__READY_FOR_REVISION__:");
    const isSpecialMessage = isGreeting || isContinue;

    let assessmentResultData = null;
    let revisionAssessmentData = null;
    if (isAssessmentResult) {
      try {
        const assessmentId = message.replace("__ASSESSMENT_RESULT__:", "");
        const assessmentResponse = await fetch(
          `${baseUrl}/api/assessments/${assessmentId}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );
        if (assessmentResponse.ok) {
          const assessmentData = await assessmentResponse.json();
          assessmentResultData = assessmentData;
        } else {
          console.error(
            "[Chat API] Failed to fetch assessment:",
            assessmentResponse.status
          );
        }
      } catch (error) {
        console.error("[Chat API] Error fetching assessment results:", error);
      }
    }

    if (isReadyForRevision) {
      try {
        const assessmentId = message.replace("__READY_FOR_REVISION__:", "");
        const assessmentResponse = await fetch(
          `${baseUrl}/api/assessments/${assessmentId}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );
        if (assessmentResponse.ok) {
          const assessmentData = await assessmentResponse.json();
          revisionAssessmentData = assessmentData;
        } else {
          console.error(
            "[Chat API] Failed to fetch assessment for revision:",
            assessmentResponse.status
          );
        }
      } catch (error) {
        console.error(
          "[Chat API] Error fetching assessment for revision:",
          error
        );
      }
    }

    if (!isSpecialMessage && !isAssessmentResult && !isReadyForRevision) {
      try {
        await supabase.from("course_messages").insert({
          course_id: courseId,
          role: "user",
          content: message,
          message_type: "text",
        });
        const userMessageCount = await incrementMessageCount(
          courseId,
          supabase
        );

        const shouldUpdateSummary = userMessageCount % 20 === 0;

        if (shouldUpdateSummary && validatedUserId) {
          try {
            await saveCourseSummary(courseId, validatedUserId, accessToken);
            invalidateMemoriesCache(courseId, validatedUserId);
          } catch (summaryError) {
            console.error(
              "[Memory Summary] Error in saveCourseSummary:",
              summaryError
            );
          }
        }
      } catch (msgErr) {
        console.error("Error inserting user message:", msgErr);
        invalidateMessageCountCache(courseId);
      }
    }

    let courseInfo: any = null;
    try {
      const { data: course, error: courseError } = await supabase
        .from("courses")
        .select(
          "title, description, curriculum, learning_path_id, course_order, current_lesson_index, current_topic_index, metadata"
        )
        .eq("id", courseId)
        .eq("user_id", validatedUserId)
        .single();

      if (!courseError && course) {
        courseInfo = course;

        if (course.learning_path_id) {
          const { data: learningPath } = await supabase
            .from("learning_paths")
            .select("title, goal")
            .eq("id", course.learning_path_id)
            .single();

          if (learningPath) {
            courseInfo.learning_path = learningPath;
          }
        }
      }
    } catch (error) {
      console.error("Error fetching course info:", error);
    }

    let relevantMemories = getCachedMemories(courseId, validatedUserId);

    if (relevantMemories === null) {
      try {
        const memories = await recallMemory(
          courseId,
          message,
          validatedUserId,
          accessToken
        );

        if (memories && memories.length > 0) {
          const formattedMemories = memories.map((mem) => mem.pageContent);

          relevantMemories =
            "Previous relevant conversations:\n" +
            formattedMemories.join("\n\n") +
            "\n\n";
        } else {
          relevantMemories = "";
        }

        setCachedMemories(courseId, validatedUserId, relevantMemories);
      } catch (error: any) {
        console.error(
          "Error retrieving memories, continuing without them:",
          error
        );
        const errorMessage = error?.message || "Unknown error";
        relevantMemories = `Note: Error retrieving memory context: ${errorMessage}. Continuing without previous context.`;
        setCachedMemories(courseId, validatedUserId, relevantMemories);
      }
    }

    const hasSerperKey = process.env.SERPER_API_KEY;
    let searchResults = "";

    if (hasSerperKey && enableWebSearch) {
      try {
        const serperTool = webTools[0];
        const searchResponse = await serperTool.call(message);

        if (searchResponse) {
          try {
            const parsedResults = JSON.parse(searchResponse);
            searchResults = `Web search results: ${JSON.stringify(
              parsedResults
            )}\n\n`;

            if (parsedResults.organic && parsedResults.organic.length > 0) {
              try {
                const topResult = parsedResults.organic[0];
                if (topResult.link) {
                  const scraperTool = webTools[1];
                  const scrapedContent = await scraperTool.call(topResult.link);
                  searchResults += `Content from top result: ${scrapedContent}\n\n`;
                }
              } catch (error) {
                console.error("Error scraping website:", error);
                searchResults +=
                  "Note: Couldn't retrieve detailed content from the top result.\n\n";
              }
            }
          } catch (error) {
            searchResults = `Web search results: ${searchResponse.substring(
              0,
              1000
            )}...\n\n`;
          }
        }
      } catch (error) {
        console.error("Error using web search tools:", error);
        searchResults =
          "Note: Unable to search the web. Please check your Serper API key in the environment variables (.env.local file).\n\n";
      }
    } else {
      searchResults = enableWebSearch
        ? "Note: Web search is disabled. To enable it, please add a valid SERPER_API_KEY to your environment variables (.env.local file).\n\n"
        : "Note: Web search is disabled by user preference.\n\n";
    }

    const conversationHistory = await loadCourseHistoryFromDatabase(
      courseId,
      supabase,
      50
    );

    const chatSession = model.startChat({
      generationConfig: model.generationConfig,
      history: conversationHistory,
    });

    const stream = new ReadableStream({
      async start(controller) {
        let isClosed = false;

        const safeEnqueue = (data: string) => {
          try {
            if (!isClosed) {
              controller.enqueue(data);
            }
          } catch (error: any) {
            if (error.code !== "ERR_INVALID_STATE") {
              console.error("Error enqueueing data:", error);
            }
            isClosed = true;
          }
        };
        if (isSpecialMessage) {
          const courseTitle =
            courseInfo?.title?.replace(/^Course \d+:\s*/i, "") || "This Course";
          const courseDesc = courseInfo?.description || "";
          const learningPathInfo = courseInfo?.learning_path;
          const courseOrder = courseInfo?.course_order ?? -1;
          const lessons = courseInfo?.curriculum?.lessons || [];
          const currentLessonIndex = courseInfo?.current_lesson_index ?? 0;
          const currentTopicIndex = courseInfo?.current_topic_index ?? 0;

          const courseDisplay =
            courseOrder >= 0
              ? `Course ${courseOrder + 1}: ${courseTitle}`
              : courseTitle;
          const learningPathDisplay = learningPathInfo
            ? learningPathInfo.title.toUpperCase()
            : "";

          let systemContext = "";

          if (isGreeting) {
            systemContext = `You are an AI mentor. Greet the user starting this course.

Include these as separate bold lines with line breaks before and after:
**${courseDisplay}**
**${learningPathDisplay || "[LEARNING PATH]"}**

Course: ${courseTitle}${courseDesc ? ` - ${courseDesc}` : ""}
${
  learningPathInfo
    ? `Learning Path: ${learningPathInfo.title} (Goal: ${learningPathInfo.goal})`
    : ""
}
${
  lessons.length > 0
    ? `Lessons (${lessons.length}): ${lessons
        .slice(0, 3)
        .map((l: any) => l.title)
        .join(", ")}${lessons.length > 3 ? "..." : ""}`
    : ""
}

Be concise (1-2 short paragraphs). Briefly explain what they'll learn and 
then IMMEDIATELY begin teaching - don't wait for them to ask. 
Take the lead by explaining the first lesson, presenting concepts, 
and actively engaging them with questions or exercises. 
Drive the conversation forward - you're the teacher, guide them proactively.`;
          } else if (isContinue) {
            const currentLesson = lessons[currentLessonIndex];
            const currentTopic = currentLesson?.topics?.[currentTopicIndex];

            const continueMetadata = courseInfo?.metadata || {};
            const continuePendingTopic =
              continueMetadata.pending_assessment_topic;
            const continueInProgressId =
              continueMetadata.in_progress_assessment_id;
            const continueInProgressTopic =
              continueMetadata.in_progress_assessment_topic;

            let hasInProgressAssessment = false;
            if (continueInProgressId) {
              const { data: assessmentCheck } = await supabase
                .from("assessments")
                .select("status")
                .eq("id", continueInProgressId)
                .eq("user_id", validatedUserId)
                .single();

              hasInProgressAssessment =
                assessmentCheck?.status === "in_progress";
            }

            let continueAssessmentContext = "";
            if (continuePendingTopic) {
              continueAssessmentContext = `\n\n⚠️ CRITICAL: There is a PENDING ASSESSMENT for topic: "${continuePendingTopic}". The user needs to start this assessment before continuing. Welcome them back and remind them: "Welcome back! Before we continue, please complete the assessment for [topic name] to move forward. You can start it using the 'Start Assessment' button."`;
            } else if (hasInProgressAssessment && continueInProgressTopic) {
              continueAssessmentContext = `\n\n⚠️ CRITICAL: There is an IN-PROGRESS ASSESSMENT for topic: "${continueInProgressTopic}". The user started but hasn't completed it. Welcome them back and remind them: "Welcome back! Please complete the assessment for [topic name] before we continue. You can resume it from where you left off."`;
            }

            systemContext = `You are an AI mentor. Welcome back the student.

Course: **${courseDisplay}**
Learning Path: **${learningPathDisplay}**
Current: Lesson ${currentLessonIndex + 1}${
              currentLesson ? ` - ${currentLesson.title}` : ""
            }${
              currentTopic
                ? `, Topic ${currentTopicIndex + 1} - ${currentTopic.title}`
                : ""
            }

Recent context:
${relevantMemories || "No previous context."}
${continueAssessmentContext}

${
  continueAssessmentContext
    ? "IMPORTANT: Address the assessment first before continuing with teaching. Be friendly but clear that they need to complete it."
    : "Be concise (1-2 short sentences). Briefly summarize their progress and then IMMEDIATELY continue teaching - don't wait for questions. Proactively push forward with explanations, questions, exercises, tasks, or assessments based on the current lesson and topic. Take charge of the learning - guide, challenge, and advance them through the material actively."
}`;
          }

          let fullResponse = "";
          try {
            const result = await chatSession.sendMessageStream(systemContext);

            for await (const chunk of result.stream) {
              const text = chunk.text();
              fullResponse += text;

              if (text) {
                safeEnqueue(`data: ${JSON.stringify({ text })}\n\n`);
              }
            }
          } catch (streamError: any) {
            console.error("Error in streaming greeting:", streamError);
            fullResponse = streamError?.message || "An error occurred";
            safeEnqueue(`data: ${JSON.stringify({ text: fullResponse })}\n\n`);
          }

          if (fullResponse) {
            try {
              await supabase.from("course_messages").insert({
                course_id: courseId,
                role: "assistant",
                content: fullResponse,
                message_type: "text",
              });
            } catch (msgErr) {
              console.error("Error inserting special message:", msgErr);
            }
          }

          await updateCourseTimestamp(courseId, accessToken);

          if (!isClosed) {
            try {
              controller.close();
              isClosed = true;
            } catch (error: any) {
              if (error.code !== "ERR_INVALID_STATE") {
                console.error("Error closing controller:", error);
              }
            }
          }
          return;
        }

        const lessons = courseInfo?.curriculum?.lessons || [];
        const currentLessonIndex = courseInfo?.current_lesson_index ?? 0;
        const currentTopicIndex = courseInfo?.current_topic_index ?? 0;
        const currentLesson = lessons[currentLessonIndex];
        const currentTopic = currentLesson?.topics?.[currentTopicIndex];

        const courseMetadata = courseInfo?.metadata || {};
        let pendingAssessmentTopic = courseMetadata.pending_assessment_topic;
        let inProgressAssessmentId = courseMetadata.in_progress_assessment_id;
        let inProgressAssessmentTopic =
          courseMetadata.in_progress_assessment_topic;

        if (isAssessmentResult || isReadyForRevision) {
          inProgressAssessmentId = null;
          inProgressAssessmentTopic = null;
          pendingAssessmentTopic = null;
        }

        let hasInProgressAssessment = false;
        if (
          inProgressAssessmentId &&
          !isAssessmentResult &&
          !isReadyForRevision
        ) {
          const { data: assessmentCheck } = await supabase
            .from("assessments")
            .select("status")
            .eq("id", inProgressAssessmentId)
            .eq("user_id", validatedUserId)
            .single();

          hasInProgressAssessment = assessmentCheck?.status === "in_progress";

          if (
            !hasInProgressAssessment &&
            (inProgressAssessmentId || inProgressAssessmentTopic)
          ) {
            try {
              const { data: courseData } = await supabase
                .from("courses")
                .select("metadata")
                .eq("id", courseId)
                .single();

              if (courseData?.metadata) {
                const currentMetadata = courseData.metadata || {};
                const {
                  in_progress_assessment_id: metaId,
                  in_progress_assessment_topic: metaTopic,
                  ...cleanedMetadata
                } = currentMetadata;

                if (metaId === inProgressAssessmentId) {
                  await supabase
                    .from("courses")
                    .update({ metadata: cleanedMetadata })
                    .eq("id", courseId);

                  inProgressAssessmentId = null;
                  inProgressAssessmentTopic = null;
                }
              }
            } catch (error) {
              console.error("[Chat API] Error clearing stale metadata:", error);
            }
          }
        }

        const assessmentTopic =
          inProgressAssessmentTopic || pendingAssessmentTopic;
        const hasPendingAssessment =
          !!pendingAssessmentTopic && !isAssessmentResult;

        let assessmentContext = "";
        if (!isAssessmentResult) {
          if (hasInProgressAssessment) {
            assessmentContext = `\n\n⚠️ CRITICAL: There is an IN-PROGRESS ASSESSMENT for topic: "${assessmentTopic}". The user started but hasn't completed it. 
- Do NOT continue teaching new concepts or signal [ASSESSMENT_READY]
- Remind the user: "I notice you have an incomplete assessment for [topic name]. Please complete it before we continue. You can resume it from where you left off."
- Answer any questions they have, but keep reminding them about the assessment
- Only proceed with teaching after they complete the assessment`;
          } else if (hasPendingAssessment) {
            assessmentContext = `\n\n⚠️ CRITICAL: There is a PENDING ASSESSMENT for topic: "${pendingAssessmentTopic}". The user has not yet started this assessment.
- Do NOT signal [ASSESSMENT_READY] again for this topic
- Remind the user: "Before we continue, please complete the assessment for [topic name]. You can start it using the 'Start Assessment' button."
- Answer any questions they have, but keep reminding them about the assessment
- Only proceed with teaching after they complete the assessment`;
          }
        }

        let lessonContext = "";
        if (currentLesson && !isAssessmentResult) {
          lessonContext = `\n\nCURRENT LESSON CONTEXT (STAY FOCUSED ON THIS):
Lesson ${currentLessonIndex + 1}: ${currentLesson.title}
${currentLesson.description ? `Description: ${currentLesson.description}` : ""}
${
  currentTopic
    ? `Current Topic ${currentTopicIndex + 1}: ${currentTopic}`
    : `Topics: ${(currentLesson.topics || []).join(", ")}`
}
${assessmentContext}

CRITICAL: You MUST stay on track with this lesson. ${
            hasPendingAssessment || hasInProgressAssessment
              ? "However, the assessment takes priority - address it first."
              : "Continue teaching, explaining, or practicing concepts from THIS lesson and topic. Do NOT jump to unrelated topics or general introductions. Progress through the lesson systematically."
          }`;
        }

        const systemContext = `You are an active, proactive AI mentor who drives learning forward. 
        DON'T wait passively for questions - take initiative and push the conversation forward. 

CRITICAL TRACKING REQUIREMENT:
- ALWAYS stay focused on the CURRENT LESSON and TOPIC provided below
- Continue from where you left off in the lesson
- Progress systematically through the lesson material
- Do NOT jump to unrelated topics or general introductions
- Keep advancing through the specific lesson content

CONCEPT PROGRESSION WITHIN TOPICS:
- Topics often contain multiple sub-concepts (e.g., "Python syntax and data structures" includes lists, dicts, tuples, sets)
- Use the conversation history to track which concepts within the current topic have been covered
- Teach concepts incrementally: explain one concept, validate understanding through questions/exercises, then move to the next
- Reference what you've already taught in the conversation to avoid repetition and ensure progression
- If a concept needs more explanation based on user responses, provide additional examples or clarification
- Only move to the next concept when the current one is understood

ASSESSMENT SIGNALING:
- When you determine that ALL concepts within the current topic have been adequately covered and understood, signal readiness for assessment
- Before signaling, say something like: "We've now covered all the concepts of [topic name]. Do you have any questions or anything that's unclear? If you feel confident, please complete the assessment before we move on to the next topic."
- Then include this exact marker at the END of your response: [ASSESSMENT_READY]
- Only signal [ASSESSMENT_READY] when:
  1. You've covered all major concepts within the current topic
  2. The user has demonstrated understanding through your questions/exercises
  3. You're confident they're ready for a formal assessment
- After signaling [ASSESSMENT_READY], wait for the assessment to be generated and completed before proceeding

ASSESSMENT RESULT HANDLING:
- When you receive assessment results, analyze them carefully
- For the INITIAL summary (right after assessment completion): Provide a diagnostic summary only - what was mastered, what needs work, and brief explanations of errors. DO NOT include practice questions or detailed revision content.
- When the user clicks "Ready for Revision" (indicated by a follow-up message after the initial summary): Provide detailed revision with practice questions, step-by-step explanations, and exercises focused on the failed concepts
- For failed concepts: analyze the failed questions and user responses to identify knowledge gaps
- After revision, a new assessment will be generated - continue this cycle until all concepts are mastered
- When all assessment items pass, acknowledge success and prepare to move to the next topic/lesson

CONVERSATION MEMORY REQUIREMENT:
- The conversation history below shows previous exchanges - USE IT to follow up on questions you asked
- If you previously asked a question and the user answered, acknowledge their answer and build upon it
- Reference previous explanations, examples, or concepts you introduced earlier in the conversation
- Maintain continuity - your responses should connect to what was discussed before
- Use the memories and history to personalize your teaching based on what the student has already learned

When the user asks something: Answer clearly and briefly, 
then IMMEDIATELY follow up with related questions, exercises, deeper explanations, 
or next steps based on the CURRENT LESSON/TOPIC (not random topics).

When the user doesn't ask: Proactively teach, explain concepts, generate exercises, 
ask comprehension questions, assign tasks - but ALWAYS related to the CURRENT LESSON/TOPIC.
If you asked a question before, check if they answered it and build upon their response.

Your role is to actively guide, challenge, and advance the student through the course material systematically. 
Lead the learning - don't just respond, drive the progress - but STAY ON TRACK with the lesson and MAINTAIN CONVERSATION CONTINUITY.${lessonContext}`;

        let assessmentResultContext = "";
        let revisionContext = "";
        let isReadyForRevisionFlag = false;
        if (isAssessmentResult) {
          if (assessmentResultData) {
            const { assessment, items } = assessmentResultData;
            const passedItems = items.filter((item: any) => item.is_correct);
            const failedItems = items.filter((item: any) => !item.is_correct);

            const failedConcepts = assessment.metadata?.failed_concepts || [];
            isReadyForRevisionFlag = !!assessment.metadata?.summary;

            assessmentResultContext = `\n\n⚠️⚠️⚠️ ASSESSMENT RESULTS - PRIORITY #1 (IGNORE ALL OTHER ASSESSMENT WARNINGS) ⚠️⚠️⚠️

The user has JUST COMPLETED an assessment for the topic: ${
              assessment.metadata?.in_progress_assessment_topic ||
              assessment.metadata?.topic ||
              "current topic"
            }

Results:
- Total items: ${items.length}
- Passed: ${passedItems.length}
- Failed: ${failedItems.length}
- Score: ${assessment.overall_score}%
- Status: ${assessment.status} (COMPLETED - NO LONGER IN PROGRESS)

${
  failedItems.length > 0
    ? `FAILED ITEMS AND USER ANSWERS:
${failedItems
  .map(
    (item: any, idx: number) =>
      `Item ${idx + 1}: ${item.question_text}
  Correct Answer: ${item.correct_answer}
  User Answer: ${item.user_answer || "No answer"}
  Error: ${item.error_type || "Incorrect"}
  Concepts: ${(item.concepts || []).join(", ") || "Unknown"}`
  )
  .join("\n\n")}

FAILED CONCEPTS THAT NEED REVISION: ${failedConcepts.join(", ")}

${
  isReadyForRevisionFlag
    ? `YOUR TASK (READY FOR REVISION - IGNORE ANY INCOMPLETE ASSESSMENT WARNINGS):
The user has clicked "Ready for Revision". The diagnostic summary already exists. Now provide detailed revision:

1. Start with targeted revision focused on the failed concepts: ${failedConcepts.join(
        ", "
      )}
2. Provide step-by-step explanations for each misunderstood concept
3. Include practice questions and exercises for each concept
4. Give clear examples and guidance
5. Make it interactive and educational

Go straight into the detailed revision content - do NOT repeat the diagnostic summary.`
    : `YOUR TASK (DO THIS NOW - IGNORE ANY INCOMPLETE ASSESSMENT WARNINGS):
1. Summarize the assessment results - what was mastered, what was misunderstood, what needs more practice
2. Analyze the failed questions and user responses to identify knowledge gaps
3. Explain what went wrong and why (briefly)
4. List the concepts that need revision: ${failedConcepts.join(", ")}
5. Be encouraging but clear about what needs improvement

IMPORTANT: This is the INITIAL summary. DO NOT include practice questions, exercises, or detailed revision content. The user will click "Ready for Revision" to get the detailed revision with practice questions.`
}`
    : `ALL ITEMS PASSED! 

Congratulations! The user has successfully mastered all concepts in this topic. Acknowledge their success and prepare to move to the next topic/lesson.`
}
`;
          } else {
            assessmentResultContext = `\n\n⚠️⚠️⚠️ ASSESSMENT RESULTS - PRIORITY #1 ⚠️⚠️⚠️

The user has just completed an assessment. The assessment result data is being processed. 
- Provide a summary acknowledging completion
- Ask if they'd like to review any specific concepts
- Prepare to provide revision guidance based on the results`;
          }
        }

        if (isReadyForRevision && revisionAssessmentData) {
          const { assessment, items } = revisionAssessmentData;
          const failedItems = items.filter((item: any) => !item.is_correct);
          const failedConcepts = assessment.metadata?.failed_concepts || [];

          revisionContext = `\n\n⚠️⚠️⚠️ READY FOR REVISION - PRIORITY #1 ⚠️⚠️⚠️

The user has clicked "Ready for Revision" for the assessment on: ${
            assessment.metadata?.in_progress_assessment_topic ||
            assessment.metadata?.topic ||
            "current topic"
          }

Assessment Results:
- Total items: ${items.length}
- Failed: ${failedItems.length}
- Score: ${assessment.overall_score}%

FAILED ITEMS:
${failedItems
  .map(
    (item: any, idx: number) =>
      `Item ${idx + 1}: ${item.question_text}
  Correct Answer: ${item.correct_answer}
  User Answer: ${item.user_answer || "No answer"}
  Error: ${item.error_type || "Incorrect"}
  Concepts: ${(item.concepts || []).join(", ") || "Unknown"}`
  )
  .join("\n\n")}

FAILED CONCEPTS THAT NEED REVISION: ${failedConcepts.join(", ")}

YOUR TASK - PROVIDE DETAILED REVISION:
1. Start with targeted revision focused on the failed concepts: ${failedConcepts.join(
            ", "
          )}
2. Provide step-by-step explanations for each misunderstood concept
3. Include practice questions and exercises for each concept
4. Give clear examples and guidance
5. Make it interactive and educational

Go straight into the detailed revision content - do NOT repeat the diagnostic summary.`;
        }

        const enhancedMessage = isReadyForRevision
          ? `${systemContext}
        
${relevantMemories ? relevantMemories : ""}

${revisionContext}

${assessmentContext}

Current message: The user has clicked "Ready for Revision". IGNORE any incomplete assessment warnings. Focus ONLY on the REVISION section above and provide detailed revision with practice questions, step-by-step explanations, and exercises.`
          : isAssessmentResult
          ? `${systemContext}
        
${relevantMemories ? relevantMemories : ""}

${assessmentResultContext}

Current message: The user has just completed an assessment. IGNORE any incomplete assessment warnings. Focus ONLY on the ASSESSMENT RESULTS section above. 

${
  isReadyForRevisionFlag
    ? `IMPORTANT: The user has clicked "Ready for Revision". The assessment summary already exists, so provide detailed revision with:
- Practice questions and exercises focused on the failed concepts
- Step-by-step explanations of the misunderstood concepts
- Clear examples and guidance
- Interactive practice to reinforce learning

Do NOT repeat the diagnostic summary - go straight into the detailed revision content.`
    : `This is the FIRST time generating the summary. Provide ONLY the diagnostic summary as instructed in the ASSESSMENT RESULTS section above. DO NOT include practice questions or detailed revision content.`
}`
          : `${systemContext}
        
${relevantMemories ? relevantMemories : ""}

${assessmentResultContext}

${assessmentContext}

Current message: ${message}

${
  searchResults
    ? `Here are some web search results that might help answer this query with the latest information:\n${searchResults}`
    : ""
}`;

        let fullResponse = "";
        try {
          const result = await chatSession.sendMessageStream(enhancedMessage);

          for await (const chunk of result.stream) {
            let text = chunk.text();
            fullResponse += text;

            if (text.includes("[ASSESSMENT_READY]")) {
              text = text.replace(/\[ASSESSMENT_READY\]/g, "").trim();
            }

            if (text) {
              safeEnqueue(`data: ${JSON.stringify({ text })}\n\n`);
            }
          }
        } catch (streamError: any) {
          console.error("Error in streaming response:", streamError);
          fullResponse =
            streamError?.message ||
            "An error occurred while generating the response";
          safeEnqueue(`data: ${JSON.stringify({ text: fullResponse })}\n\n`);
        }

        const displayResponse = fullResponse
          .replace(/\[ASSESSMENT_READY\]/g, "")
          .trim();
        const assessmentReady = fullResponse.includes("[ASSESSMENT_READY]");

        try {
          await supabase.from("course_messages").insert({
            course_id: courseId,
            role: "assistant",
            content: displayResponse,
            message_type: "text",
          });
        } catch (assistErr) {
          console.error("Error inserting assistant message:", assistErr);
        }

        if (
          isAssessmentResult &&
          assessmentResultData?.assessment?.id &&
          displayResponse &&
          !isReadyForRevision
        ) {
          try {
            const { data: currentAssessment } = await supabase
              .from("assessments")
              .select("metadata")
              .eq("id", assessmentResultData.assessment.id)
              .single();

            const currentMetadata = currentAssessment?.metadata || {};
            await supabase
              .from("assessments")
              .update({
                metadata: {
                  ...currentMetadata,
                  summary: displayResponse,
                },
              })
              .eq("id", assessmentResultData.assessment.id);
          } catch (summarySaveError) {
            console.error("Error saving assessment summary:", summarySaveError);
          }
        }

        if (assessmentReady && currentTopic) {
          try {
            const { data: courseData } = await supabase
              .from("courses")
              .select("metadata")
              .eq("id", courseId)
              .single();

            const currentMetadata = courseData?.metadata || {};

            if (!currentMetadata.pending_assessment_topic) {
              await supabase
                .from("courses")
                .update({
                  metadata: {
                    ...currentMetadata,
                    pending_assessment_topic: currentTopic,
                    pending_assessment_lesson_index: currentLessonIndex,
                    pending_assessment_topic_index: currentTopicIndex,
                  },
                })
                .eq("id", courseId);
            }
          } catch (metadataError) {
            console.error("Error storing assessment readiness:", metadataError);
          }

          safeEnqueue(
            `data: ${JSON.stringify({
              type: "assessment_ready_signal",
              topic: currentTopic,
            })}\n\n`
          );
        }

        await updateCourseTimestamp(courseId, accessToken);

        if (!isClosed) {
          try {
            controller.close();
            isClosed = true;
          } catch (error: any) {
            if (error.code !== "ERR_INVALID_STATE") {
              console.error("Error closing controller:", error);
            }
          }
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e: any) {
    console.error("API Error:", e);
    return NextResponse.json(
      { error: e.message || "Failed to process request" },
      { status: 500 }
    );
  }
}
