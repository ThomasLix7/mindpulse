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
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

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
    const isSpecialMessage = isGreeting || isContinue;

    if (!isSpecialMessage) {
      try {
        await supabase.from("course_messages").insert({
          course_id: courseId,
          role: "user",
          content: message,
          message_type: "text",
        });
      } catch (msgErr) {
        console.error("Error inserting user message:", msgErr);
      }
    }

    let courseInfo: any = null;
    try {
      const { data: course, error: courseError } = await supabase
        .from("courses")
        .select(
          "title, description, curriculum, learning_path_id, course_order, current_lesson_index, current_topic_index"
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

Be concise (1-2 short sentences). Briefly summarize their progress 
and then IMMEDIATELY continue teaching - don't wait for questions. 
Proactively push forward with explanations, questions, exercises, tasks, or assessments based on the current lesson and topic. 
Take charge of the learning - guide, challenge, and advance them through the material actively.`;
          }

          let fullResponse = "";
          try {
            const result = await chatSession.sendMessageStream(systemContext);

            for await (const chunk of result.stream) {
              const text = chunk.text();
              fullResponse += text;

              if (text) {
                controller.enqueue(`data: ${JSON.stringify({ text })}\n\n`);
              }
            }
          } catch (streamError: any) {
            console.error("Error in streaming greeting:", streamError);
            fullResponse = streamError?.message || "An error occurred";
            controller.enqueue(
              `data: ${JSON.stringify({ text: fullResponse })}\n\n`
            );
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

          try {
            const { count, error: countError } = await supabase
              .from("course_messages")
              .select("*", { count: "exact", head: true })
              .eq("course_id", courseId)
              .eq("role", "user");

            if (countError) {
              console.error(
                "Error getting message count (special):",
                countError
              );
            }

            const userMessageCount = count || 0;
            const shouldUpdateSummary =
              userMessageCount === 1 || userMessageCount % 20 === 0;

            if (shouldUpdateSummary && validatedUserId) {
              try {
                await saveCourseSummary(courseId, validatedUserId, accessToken);
                invalidateMemoriesCache(courseId, validatedUserId);
              } catch (summaryError) {
                console.error(
                  "[Memory Summary] Error in saveCourseSummary (special):",
                  summaryError
                );
              }
            }

            await updateCourseTimestamp(courseId, accessToken);
          } catch (error) {
            console.error("Error saving memory (special):", error);
          }

          controller.close();
          return;
        }

        const lessons = courseInfo?.curriculum?.lessons || [];
        const currentLessonIndex = courseInfo?.current_lesson_index ?? 0;
        const currentTopicIndex = courseInfo?.current_topic_index ?? 0;
        const currentLesson = lessons[currentLessonIndex];
        const currentTopic = currentLesson?.topics?.[currentTopicIndex];

        let lessonContext = "";
        if (currentLesson) {
          lessonContext = `\n\nCURRENT LESSON CONTEXT (STAY FOCUSED ON THIS):
Lesson ${currentLessonIndex + 1}: ${currentLesson.title}
${currentLesson.description ? `Description: ${currentLesson.description}` : ""}
${
  currentTopic
    ? `Current Topic ${currentTopicIndex + 1}: ${currentTopic}`
    : `Topics: ${(currentLesson.topics || []).join(", ")}`
}

CRITICAL: You MUST stay on track with this lesson. Continue teaching, explaining, or practicing concepts from THIS lesson and topic. Do NOT jump to unrelated topics or general introductions. Progress through the lesson systematically.`;
        }

        const systemContext = `You are an active, proactive AI mentor who drives learning forward. 
        DON'T wait passively for questions - take initiative and push the conversation forward. 

CRITICAL TRACKING REQUIREMENT:
- ALWAYS stay focused on the CURRENT LESSON and TOPIC provided below
- Continue from where you left off in the lesson
- Progress systematically through the lesson material
- Do NOT jump to unrelated topics or general introductions
- Keep advancing through the specific lesson content

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
ask comprehension questions, assign tasks, or provide assessments - but ALWAYS related to the CURRENT LESSON/TOPIC.
If you asked a question before, check if they answered it and build upon their response.

Your role is to actively guide, challenge, and advance the student through the course material systematically. 
Lead the learning - don't just respond, drive the progress - but STAY ON TRACK with the lesson and MAINTAIN CONVERSATION CONTINUITY.${lessonContext}`;

        const enhancedMessage = `${systemContext}
        
${relevantMemories ? relevantMemories : ""}

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
            const text = chunk.text();
            fullResponse += text;

            if (text) {
              controller.enqueue(`data: ${JSON.stringify({ text })}\n\n`);
            }
          }
        } catch (streamError: any) {
          console.error("Error in streaming response:", streamError);
          fullResponse =
            streamError?.message ||
            "An error occurred while generating the response";
          controller.enqueue(
            `data: ${JSON.stringify({ text: fullResponse })}\n\n`
          );
        }

        try {
          await supabase.from("course_messages").insert({
            course_id: courseId,
            role: "assistant",
            content: fullResponse,
            message_type: "text",
          });
        } catch (assistErr) {
          console.error("Error inserting assistant message:", assistErr);
        }

        try {
          const { count, error: countError } = await supabase
            .from("course_messages")
            .select("*", { count: "exact", head: true })
            .eq("course_id", courseId)
            .eq("role", "user");

          if (countError) {
            console.error("Error getting message count:", countError);
          }

          const userMessageCount = count || 0;
          const shouldUpdateSummary =
            userMessageCount === 1 || userMessageCount % 2 === 0;

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

          await updateCourseTimestamp(courseId, accessToken);
        } catch (error) {
          console.error("Error saving memory:", error);
        }

        controller.close();
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
