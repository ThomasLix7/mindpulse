import { NextResponse } from "next/server";
import { model } from "@/lib/gemini";
import { webTools } from "@/tools/webSearch";

export const maxDuration = 30;

const sessionHistory = new Map<string, any[]>();

function getSessionHistory(sessionId: string) {
  return sessionHistory.get(sessionId) || [];
}

function updateSessionHistory(
  sessionId: string,
  userMessage: string,
  aiResponse: string
) {
  const history = getSessionHistory(sessionId);
  history.push({ role: "user", parts: [{ text: userMessage }] });
  history.push({ role: "model", parts: [{ text: aiResponse }] });
  sessionHistory.set(sessionId, history);
}

export async function POST(req: Request) {
  try {
    const { message, sessionId } = await req.json();

    if (!message?.trim() || !sessionId?.trim()) {
      return NextResponse.json(
        { error: "Message and session ID are required" },
        { status: 400 }
      );
    }

    // Check if the required API key is available
    const hasSerperKey = process.env.SERPER_API_KEY;
    let searchResults = "";

    if (hasSerperKey) {
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
      console.warn("Serper API key not found in environment variables");
      searchResults =
        "Note: Web search is disabled. To enable it, please add a valid SERPER_API_KEY to your environment variables (.env.local file).\n\n";
    }

    const chatSession = model.startChat({
      generationConfig: model.generationConfig,
      history: getSessionHistory(sessionId),
    });

    // Create a stream
    const stream = new ReadableStream({
      async start(controller) {
        // Enhance the message with web search results if available
        const enhancedMessage = searchResults
          ? `${message}\n\nHere are some web search results that might help answer this query with the latest information:\n${searchResults}`
          : message;

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

        // Update session history after the full response is received
        updateSessionHistory(sessionId, message, fullResponse);

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
