import { NextResponse } from "next/server";
import { model } from "@/lib/gemini";
import { webTools } from "@/tools/webSearch";
import { saveMemory, recallMemory } from "@/utils/memory";
import { createServerClient } from "@/utils/supabase-server";

export const maxDuration = 30;

const conversationHistory = new Map<string, any[]>();

function getConversationHistory(conversationId: string) {
  return conversationHistory.get(conversationId) || [];
}

function updateConversationHistory(
  conversationId: string,
  userMessage: string,
  aiResponse: string
) {
  const history = getConversationHistory(conversationId);
  history.push({ role: "user", parts: [{ text: userMessage }] });
  history.push({ role: "model", parts: [{ text: aiResponse }] });
  conversationHistory.set(conversationId, history);
}

async function updateConversationTimestamp(conversationId: string) {
  try {
    const supabase = await createServerClient();
    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId);
  } catch (error) {
    console.error("Error updating conversation timestamp:", error);
    // Continue anyway, this is not critical
  }
}

export async function POST(req: Request) {
  try {
    const {
      message,
      conversationId,
      userId,
      isLongTerm = false,
      enableWebSearch = true,
    } = await req.json();

    if (!message?.trim() || !conversationId?.trim()) {
      return NextResponse.json(
        { error: "Message and conversation ID are required" },
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
    const supabase = await createServerClient();

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

    // Retrieve relevant memories for this user and query
    let relevantMemories = "";
    try {
      // Check if this is a personal information query
      const isPersonalInfoQuery =
        message.toLowerCase().includes("name") ||
        message.toLowerCase().includes("who am i") ||
        message.toLowerCase().includes("about me") ||
        message.toLowerCase().includes("remember me");

      // Get conversation-based and long-term memories
      const memories = await recallMemory(
        conversationId,
        message,
        validatedUserId
      );

      // For personal information queries, also directly check long-term memories
      let longTermMemories: any[] = [];
      if (isPersonalInfoQuery && validatedUserId) {
        try {
          const { recallLongTermMemory } = await import("@/utils/memory");
          longTermMemories = await recallLongTermMemory(
            validatedUserId,
            message
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
          `Retrieved ${allMemories.length} total memories (${memories.length} from conversation, ${longTermMemories.length} from long-term storage)`
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
        console.log(
          `No relevant memories found for conversation: ${conversationId}`
        );
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
      history: getConversationHistory(conversationId),
    });

    // Create a stream
    const stream = new ReadableStream({
      async start(controller) {
        // Enhance the message with both memories and web search results
        const systemContext = `You are a helpful AI assistant that remembers past conversations to provide more personalized responses.`;

        const enhancedMessage = `${systemContext}
        
${relevantMemories ? relevantMemories : ""}

${message}

${
  searchResults
    ? `Here are some web search results that might help answer this query with the latest information:\n${searchResults}`
    : ""
}`;

        const result = await chatSession.sendMessageStream(enhancedMessage);
        let fullResponse = "";

        for await (const chunk of result.stream) {
          const text = chunk.text();
          fullResponse += text;

          // Send each character individually
          for (const char of text) {
            controller.enqueue(`data: ${JSON.stringify({ text: char })}\n\n`);
            await new Promise((resolve) => setTimeout(resolve, 0.1)); // Optional delay
          }
        }

        // Update conversation history after the full response is received
        updateConversationHistory(conversationId, message, fullResponse);

        // Save the conversation to memory
        try {
          console.log(`Saving message to conversation: ${conversationId}`);
          const success = await saveMemory(
            conversationId,
            message,
            fullResponse,
            validatedUserId,
            isLongTerm
          );
          if (success) {
            console.log(
              `Memory saved successfully for conversation: ${conversationId}${
                isLongTerm ? " (as long-term)" : ""
              }`
            );

            // Update the conversation's timestamp
            await updateConversationTimestamp(conversationId);
          } else {
            console.warn(
              `Memory could not be saved for conversation: ${conversationId}`
            );
          }
        } catch (error) {
          console.error("Error saving memory, continuing anyway:", error);
          // Continue even if memory saving fails
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
