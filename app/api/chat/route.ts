import { NextResponse } from "next/server";
import { model } from "@/lib/gemini";
import { webTools } from "@/tools/webSearch";
import { saveMemory, recallMemory, saveCourseSummary } from "@/utils/memory";
import { createServerClient } from "@/utils/supabase-server";
import { getVectorStore } from "@/lib/vectorstore";

export const maxDuration = 30;

const courseHistory = new Map<string, any[]>();

function getCourseHistory(courseId: string) {
  return courseHistory.get(courseId) || [];
}

function updateCourseHistory(
  courseId: string,
  userMessage: string,
  aiResponse: string
) {
  const history = getCourseHistory(courseId);
  history.push({ role: "user", parts: [{ text: userMessage }] });
  history.push({ role: "model", parts: [{ text: aiResponse }] });
  courseHistory.set(courseId, history);
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
    // Continue anyway, this is not critical
  }
}

export async function POST(req: Request) {
  try {
    const {
      message,
      courseId,
      userId,
      isLongTerm = false,
      enableWebSearch = true,
    } = await req.json();

    // Allow special messages: "__GREETING__" and "__CONTINUE__"
    if (
      !message ||
      (message !== "__GREETING__" &&
        message !== "__CONTINUE__" &&
        !message.trim()) ||
      !courseId?.trim()
    ) {
      return NextResponse.json(
        { error: "Message and course ID are required" },
        { status: 400 }
      );
    }

    // Get access token from Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Authorization token required" },
        { status: 401 }
      );
    }

    const accessToken = authHeader.substring(7);

    // Create server client with user context
    const supabase = await createServerClient(accessToken);

    // Set the user session using the access token
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

    // Verify the user ID matches the token
    if (user.id !== userId) {
      return NextResponse.json({ error: "User ID mismatch" }, { status: 403 });
    }

    let validatedUserId = userId;

    // Check if this is a special message
    const isGreeting = message === "__GREETING__";
    const isContinue = message === "__CONTINUE__";
    const isSpecialMessage = isGreeting || isContinue;

    // Save the user's message to course_messages immediately (unless it's a special message)
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
        // continue; not critical for generating response
      }
    }

    let courseInfo: any = null;
    if (isSpecialMessage) {
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
    }

    // Retrieve relevant memories for this user and query
    let relevantMemories = "";
    try {
      // Check if this is a personal information query
      const isPersonalInfoQuery =
        message.toLowerCase().includes("name") ||
        message.toLowerCase().includes("who am i") ||
        message.toLowerCase().includes("about me") ||
        message.toLowerCase().includes("remember me");

      // Get course-based and long-term memories
      const memories = await recallMemory(
        courseId,
        message,
        validatedUserId,
        accessToken
      );

      // For personal information queries, also directly check long-term memories
      let longTermMemories: any[] = [];
      if (isPersonalInfoQuery && validatedUserId) {
        try {
          const { recallLongTermMemory } = await import("@/utils/memory");
          longTermMemories = await recallLongTermMemory(
            validatedUserId,
            message,
            accessToken
          );
          console.log(
            `Also checked long-term memories directly, found ${longTermMemories.length}`
          );
        } catch (error) {
          console.error("Error retrieving long-term memories directly:", error);
        }
      }

      // Combine all memories, removing duplicates
      const allMemories = [
        ...memories,
        ...longTermMemories.filter(
          (ltm) =>
            !memories.some(
              (m) =>
                m.pageContent === ltm.pageContent &&
                m.metadata.timestamp === ltm.metadata.timestamp
            )
        ),
      ];

      if (allMemories && allMemories.length > 0) {
        // Check if there are memories with personal information
        const personalMemories = allMemories.filter(
          (mem) =>
            mem.pageContent.toLowerCase().includes("my name is") ||
            mem.pageContent.toLowerCase().includes("i am ") ||
            mem.pageContent.toLowerCase().includes("call me ") ||
            (mem.pageContent.toLowerCase().includes("name") &&
              mem.pageContent.toLowerCase().includes("thomas"))
        );

        console.log(
          `Retrieved ${allMemories.length} total memories (${memories.length} from course, ${longTermMemories.length} from long-term storage)`
        );

        // Log if we found any long-term memories
        const longTermMemoriesCount = allMemories.filter(
          (mem) => mem.metadata.isLongterm === true
        ).length;

        if (longTermMemoriesCount > 0) {
          console.log(
            `Found ${longTermMemoriesCount} long-term memories marked as isLongterm=true`
          );
        }

        // Format memories, putting personal information first
        const formattedMemories = [
          ...personalMemories.map((mem) => mem.pageContent),
          ...allMemories
            .filter((mem) => !personalMemories.includes(mem))
            .map((mem) => mem.pageContent),
        ];

        relevantMemories =
          "Previous relevant conversations (PAY SPECIAL ATTENTION TO THIS PERSONAL INFORMATION ABOUT THE USER):\n" +
          formattedMemories.join("\n\n") +
          "\n\n";

        // Log if personal info was found
        if (personalMemories.length > 0) {
          console.log(
            `Found ${personalMemories.length} memories with personal information`
          );
        }
      } else {
        console.log(`No relevant memories found for course: ${courseId}`);
      }
    } catch (error) {
      console.error(
        "Error retrieving memories, continuing without them:",
        error
      );
      // Continue without memories rather than failing the request
    }

    // Check if the required API key is available and web search is enabled
    const hasSerperKey = process.env.SERPER_API_KEY;
    let searchResults = "";

    if (hasSerperKey && enableWebSearch) {
      try {
        // Use the Serper tool to search for information
        const serperTool = webTools[0];
        const searchResponse = await serperTool.call(message);

        // Process search results
        if (searchResponse) {
          try {
            const parsedResults = JSON.parse(searchResponse);
            searchResults = `Web search results: ${JSON.stringify(
              parsedResults
            )}\n\n`;

            // Try to scrape the top result if it exists
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
            console.log(
              "Raw search response (first 100 chars):",
              searchResponse.substring(0, 100)
            );
            // Still use the response, just as text instead of parsed JSON
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
      console.warn(
        enableWebSearch
          ? "Serper API key not found in environment variables"
          : "Web search disabled by user preference"
      );
      searchResults = enableWebSearch
        ? "Note: Web search is disabled. To enable it, please add a valid SERPER_API_KEY to your environment variables (.env.local file).\n\n"
        : "Note: Web search is disabled by user preference.\n\n";
    }

    const chatSession = model.startChat({
      generationConfig: model.generationConfig,
      history: getCourseHistory(courseId),
    });

    // Create a stream
    const stream = new ReadableStream({
      async start(controller) {
        // Handle special messages (greeting or continue)
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

Be concise (2-3 short paragraphs). Briefly explain what they'll learn and ask "Ready to begin?"`;
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

Be concise (1-2 short paragraphs). Briefly summarize their progress and ask "Ready to continue?"`;
          }

          let fullResponse = "";
          try {
            const result = await chatSession.sendMessageStream(systemContext);

            for await (const chunk of result.stream) {
              const text = chunk.text();
              fullResponse += text;

              for (const char of text) {
                controller.enqueue(
                  `data: ${JSON.stringify({ text: char })}\n\n`
                );
                await new Promise((resolve) => setTimeout(resolve, 0.1));
              }
            }
          } catch (streamError: any) {
            console.error("Error in streaming greeting:", streamError);
            const errorMessage = streamError?.message || "An error occurred";
            const isQuotaError =
              errorMessage.includes("429") ||
              errorMessage.includes("quota") ||
              errorMessage.includes("Quota");

            let errorMsg = "";
            if (isQuotaError) {
              errorMsg =
                "I've reached my API usage limit for today. Please try again later.";
            } else {
              errorMsg = "Sorry, I encountered an error. Please try again.";
            }

            fullResponse = errorMsg;
            for (const char of errorMsg) {
              controller.enqueue(`data: ${JSON.stringify({ text: char })}\n\n`);
            }
          }

          // Save as an AI message
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

          controller.close();
          return;
        }

        // Regular message handling
        const systemContext = `You are an AI tutor. Be concise and direct. Answer questions clearly and briefly.`;

        // Get course summary
        let courseSummary = "";
        try {
          const vectorStore = await getVectorStore(accessToken);
          if (vectorStore && "from" in vectorStore) {
            const { data: summaryData } = await vectorStore
              .from("ai_memories")
              .select("content")
              .eq("course_id", courseId)
              .eq("user_id", validatedUserId)
              .eq("is_longterm", false)
              .filter("metadata->>'type'", "eq", "course_summary")
              .limit(1)
              .single();

            if (summaryData) {
              courseSummary = summaryData.content;
              console.log("Retrieved course summary");
            }
          }
        } catch (error) {
          console.error("Error retrieving course summary:", error);
        }

        const enhancedMessage = `${systemContext}
        
${
  courseSummary
    ? `\nCourse Context for this conversation:\n${courseSummary}\n\n`
    : ""
}
        
${relevantMemories ? relevantMemories : ""}

${message}

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

            // Send each character individually
            for (const char of text) {
              controller.enqueue(`data: ${JSON.stringify({ text: char })}\n\n`);
              await new Promise((resolve) => setTimeout(resolve, 0.1)); // Optional delay
            }
          }
        } catch (streamError: any) {
          console.error("Error in streaming response:", streamError);
          const errorMessage =
            streamError?.message ||
            "An error occurred while generating the response";
          const isQuotaError =
            errorMessage.includes("429") ||
            errorMessage.includes("quota") ||
            errorMessage.includes("Quota");

          let errorMsg = "";
          if (isQuotaError) {
            errorMsg =
              "I've reached my API usage limit for today. Please try again later or contact support if you have a higher quota.";
          } else {
            errorMsg = "Sorry, I encountered an error. Please try again.";
          }

          fullResponse = errorMsg;
          for (const char of errorMsg) {
            controller.enqueue(`data: ${JSON.stringify({ text: char })}\n\n`);
          }
        }

        if (fullResponse) {
          updateCourseHistory(courseId, message, fullResponse);
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

        // Save memory: long-term only (short-term uses summaries)
        try {
          if (isLongTerm && validatedUserId) {
            const { saveMemory } = await import("@/utils/memory");
            const success = await saveMemory(
              courseId,
              message,
              fullResponse,
              validatedUserId,
              true,
              accessToken
            );
            if (success) {
              console.log(`Long-term memory saved for course: ${courseId}`);
            }
          }

          // Update summary every 20 messages
          const { count } = await supabase
            .from("course_messages")
            .select("*", { count: "exact", head: true })
            .eq("course_id", courseId);

          const messageCount = count || 0;
          const shouldUpdateSummary =
            messageCount === 1 || messageCount % 20 === 0;

          if (shouldUpdateSummary && validatedUserId) {
            await saveCourseSummary(courseId, validatedUserId, accessToken);
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
