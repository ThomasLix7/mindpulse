import { NextResponse } from "next/server";
import { createServerClient } from "@/utils/supabase-server";
import { saveToLongTermMemory, recallLongTermMemory } from "@/utils/memory";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { getVectorStore } from "@/lib/vectorstore";
import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Unified Memory API
 *
 * This API provides multiple operations on memories through different HTTP methods:
 * - GET: Retrieve memories (previously longTermMemories endpoint)
 * - POST: Save to long-term memory (previously longTermMemory endpoint)
 * - DELETE: Forget a memory (previously forgetMemory endpoint)
 * - PUT: Find an existing memory (previously findMemory endpoint)
 */

async function validateUserId(userId: string) {
  if (!userId) {
    return {
      valid: false,
      error: {
        message: "User ID is required",
        details: "Missing userId parameter",
        status: 400,
      },
    };
  }

  try {
    const supabaseServer = await createServerClient();
    const { data: profileData, error: profileError } = await supabaseServer
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .single();

    if (profileError || !profileData) {
      console.log(
        `User ID ${userId} not found in profiles table:`,
        profileError
      );
      return {
        valid: false,
        error: {
          message: "Invalid user ID",
          details: profileError ? profileError.message : "User not found",
          status: 403,
        },
      };
    }

    return { valid: true, error: undefined };
  } catch (error) {
    console.error("Error validating user ID:", error);
    return {
      valid: false,
      error: {
        message: "User validation failed",
        details:
          error instanceof Error ? error.message : "Unknown validation error",
        status: 500,
      },
    };
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");
    const query = url.searchParams.get("query");

    if (!userId) {
      return NextResponse.json(
        {
          error: "User ID is required for long-term memory access",
          success: false,
        },
        { status: 400 }
      );
    }

    const validation = await validateUserId(userId);
    if (!validation.valid && validation.error) {
      return NextResponse.json(
        { error: validation.error.message, success: false },
        { status: validation.error.status }
      );
    }

    if (
      !query ||
      query.trim() === "" ||
      query.toLowerCase() === "all memories"
    ) {
      try {
        const supabaseServer = await createServerClient();

        const { data: directData, error: directError } = await supabaseServer
          .from("ai_memories")
          .select("id, content, metadata, created_at")
          .eq("user_id", userId)
          .eq("is_longterm", true)
          .order("created_at", { ascending: false });

        if (directError) {
          console.error("Error querying with is_longterm column:", directError);
        }

        const { data: metadataData, error: metadataError } =
          await supabaseServer
            .from("ai_memories")
            .select("id, content, metadata, created_at")
            .eq("user_id", userId)
            .filter("metadata->>'isLongterm'", "eq", "true")
            .order("created_at", { ascending: false });

        if (metadataError) {
          console.error(
            "Error querying with metadata.isLongterm:",
            metadataError
          );
        }

        let allData: any[] = [];

        if (directData && directData.length > 0) {
          console.log(
            `Found ${directData.length} memories with is_longterm=true`
          );
          allData = [...directData];
        }

        if (metadataData && metadataData.length > 0) {
          console.log(
            `Found ${metadataData.length} memories with metadata.isLongterm=true`
          );
          metadataData.forEach((item) => {
            if (!allData.some((existing) => existing.id === item.id)) {
              allData.push(item);
            }
          });
        }

        console.log(`Total combined long-term memories: ${allData.length}`);

        if (allData.length === 0) {
          return NextResponse.json({
            memories: [],
            count: 0,
            success: true,
          });
        }

        const processedMemories = allData.map((item) => {
          try {
            const content = item.content;
            const parts = content.split("\nAI: ");

            if (parts.length !== 2) {
              return {
                content,
                timestamp:
                  item.metadata.timestamp ||
                  new Date(item.created_at).getTime(),
                id: item.id,
              };
            }

            const userMessage = parts[0].replace("USER: ", "");
            const aiResponse = parts[1];

            return {
              userMessage,
              aiResponse,
              timestamp:
                item.metadata.timestamp || new Date(item.created_at).getTime(),
              type: item.metadata.type || "chat",
              id: item.id,
            };
          } catch (error) {
            console.error("Error parsing memory:", error);
            return {
              content: item.content,
              timestamp:
                item.metadata.timestamp || new Date(item.created_at).getTime(),
              id: item.id,
            };
          }
        });

        console.log(
          `Retrieved ${processedMemories.length} memories directly from database`
        );
        return NextResponse.json({
          memories: processedMemories,
          count: processedMemories.length,
          success: true,
        });
      } catch (error) {
        console.error("Error retrieving all memories:", error);
      }
    }

    const searchQuery = query || "personal information";

    try {
      const memories = await recallLongTermMemory(userId, searchQuery);

      console.log(`Vector search found ${memories.length} long-term memories`);

      // If vector search didn't find anything, try a direct database query as fallback
      if (memories.length === 0) {
        console.log(
          "Vector search found no results, falling back to direct query"
        );

        const supabaseServer = await createServerClient();

        const { data: directData, error: directError } = await supabaseServer
          .from("ai_memories")
          .select("id, content, metadata, created_at")
          .eq("user_id", userId)
          .eq("is_longterm", true)
          .order("created_at", { ascending: false });

        if (directError) {
          console.error("Error querying with is_longterm column:", directError);
        }

        const { data: metadataData, error: metadataError } =
          await supabaseServer
            .from("ai_memories")
            .select("id, content, metadata, created_at")
            .eq("user_id", userId)
            .filter("metadata->>'isLongterm'", "eq", "true")
            .order("created_at", { ascending: false });

        if (metadataError) {
          console.error(
            "Error querying with metadata.isLongterm:",
            metadataError
          );
        }

        let allData: any[] = [];

        if (directData && directData.length > 0) {
          console.log(
            `Found ${directData.length} memories with is_longterm=true`
          );
          allData = [...directData];
        }

        if (metadataData && metadataData.length > 0) {
          console.log(
            `Found ${metadataData.length} memories with metadata.isLongterm=true`
          );
          metadataData.forEach((item) => {
            if (!allData.some((existing) => existing.id === item.id)) {
              allData.push(item);
            }
          });
        }

        if (allData.length > 0) {
          console.log(
            `Found ${allData.length} long-term memories via direct query`
          );

          const directMemories = allData.map((item) => ({
            pageContent: item.content,
            metadata: {
              ...item.metadata,
              timestamp: item.created_at
                ? new Date(item.created_at).getTime()
                : Date.now(),
            },
          }));

          const processedMemories = directMemories.map((memory) => {
            try {
              const content = memory.pageContent;
              const parts = content.split("\nAI: ");

              if (parts.length !== 2) {
                return {
                  content,
                  timestamp: memory.metadata.timestamp,
                  id: memory.metadata.id,
                };
              }

              const userMessage = parts[0].replace("USER: ", "");
              const aiResponse = parts[1];

              return {
                userMessage,
                aiResponse,
                timestamp: memory.metadata.timestamp,
                type: memory.metadata.type || "chat",
                id: memory.metadata.id,
              };
            } catch (error) {
              console.error("Error parsing memory entry:", error);
              return {
                content: memory.pageContent,
                timestamp: memory.metadata.timestamp,
                id: memory.metadata.id,
              };
            }
          });

          return NextResponse.json({
            memories: processedMemories,
            count: processedMemories.length,
            success: true,
          });
        }
      }

      const processedMemories = memories.map((memory) => {
        try {
          const content = memory.pageContent || "";
          const metadataId = memory.metadata?.id || "";

          const parts = content.split("\nAI: ");

          if (parts.length !== 2) {
            return {
              content,
              timestamp: memory.metadata?.timestamp || Date.now(),
              id: metadataId,
            };
          }

          const userMessage = parts[0].replace("USER: ", "");
          const aiResponse = parts[1];

          return {
            userMessage,
            aiResponse,
            timestamp: memory.metadata?.timestamp || Date.now(),
            type: memory.metadata?.type || "chat",
            id: metadataId,
          };
        } catch (error) {
          console.error("Error parsing memory:", error);
          return {
            content: memory.pageContent || "",
            timestamp: memory.metadata?.timestamp || Date.now(),
            id: memory.metadata?.id || "",
          };
        }
      });

      return NextResponse.json({
        memories: processedMemories,
        count: memories.length,
        success: true,
      });
    } catch (error) {
      console.error("Error retrieving long-term memories:", error);
      return NextResponse.json(
        { error: "Failed to retrieve long-term memories", success: false },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json(
      { error: "Internal server error", success: false },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { memoryId, userId, userMessage, aiResponse } = await request.json();

    if (!userId) {
      return NextResponse.json(
        {
          error: "User ID is required",
          success: false,
          details: "Missing userId parameter",
        },
        { status: 400 }
      );
    }

    // We need either a memoryId OR (userMessage AND aiResponse)
    if (!memoryId && (!userMessage || !aiResponse)) {
      return NextResponse.json(
        {
          error:
            "Either memory ID or both user message and AI response are required",
          success: false,
          details: "Invalid or missing parameters",
        },
        { status: 400 }
      );
    }

    const validation = await validateUserId(userId);
    if (!validation.valid && validation.error) {
      return NextResponse.json(
        {
          error: validation.error.message,
          success: false,
          details: validation.error.details,
        },
        { status: validation.error.status }
      );
    }

    const options: {
      memoryId?: string;
      userMessage?: string;
      aiResponse?: string;
    } = {};

    if (memoryId) {
      options.memoryId = memoryId;
    }

    if (userMessage && aiResponse) {
      options.userMessage = userMessage;
      options.aiResponse = aiResponse;
    }

    console.log("Attempting to save to long-term memory:", {
      userId,
      memoryId: options.memoryId,
      hasUserMessage: !!options.userMessage,
      hasAiResponse: !!options.aiResponse,
    });

    const success = await saveToLongTermMemory(userId, options);

    if (success) {
      return NextResponse.json({
        success: true,
        message: "Memory has been saved to long-term memory",
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to save memory to long-term",
          details: memoryId
            ? `Failed to promote memory ID: ${memoryId}`
            : "Failed to create or find similar memory",
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        success: false,
        details:
          error instanceof Error
            ? error.message
            : "Unknown error in memory API",
        stack:
          process.env.NODE_ENV === "development"
            ? error instanceof Error
              ? error.stack
              : undefined
            : undefined,
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");
    const memoryId = url.searchParams.get("memoryId");

    if (!userId) {
      return NextResponse.json(
        {
          error: "User ID is required",
          success: false,
          details: "Missing userId parameter",
        },
        { status: 400 }
      );
    }

    if (!memoryId) {
      return NextResponse.json(
        {
          error: "Memory ID is required",
          success: false,
          details: "Missing memoryId parameter",
        },
        { status: 400 }
      );
    }

    const validation = await validateUserId(userId);
    if (!validation.valid && validation.error) {
      return NextResponse.json(
        {
          error: validation.error.message,
          success: false,
          details: validation.error.details,
        },
        { status: validation.error.status }
      );
    }

    const supabaseServer = await createServerClient();

    const { data: memoryData, error: memoryError } = await supabaseServer
      .from("ai_memories")
      .select("user_id, metadata, course_id, is_longterm")
      .eq("id", memoryId)
      .single();

    if (memoryError || !memoryData) {
      console.error("Error checking memory:", memoryError);
      return NextResponse.json(
        {
          error: "Memory not found",
          success: false,
          details: memoryError ? memoryError.message : "Memory not found",
        },
        { status: 404 }
      );
    }

    if (memoryData.user_id !== userId) {
      return NextResponse.json(
        {
          error: "Unauthorized",
          success: false,
          details: "This memory does not belong to the user",
        },
        { status: 403 }
      );
    }

    console.log(`Processing forget/delete request for memory ID: ${memoryId}`);

    if (memoryData.course_id) {
      console.log(`Memory has course_id: ${memoryData.course_id}`);

      console.log(`Checking if course ${memoryData.course_id} exists...`);
      const { data: courseData, error: courseError } = await supabaseServer
        .from("courses")
        .select("id")
        .eq("id", memoryData.course_id)
        .single();

      if (courseError) {
        console.log(`Error finding course: ${courseError.message}`);
      }

      if (!courseData) {
        console.log(
          `Course ${memoryData.course_id} NOT FOUND - will delete memory completely`
        );

        const { error: deleteError } = await supabaseServer
          .from("ai_memories")
          .delete()
          .eq("id", memoryId);

        if (deleteError) {
          console.error(`Error deleting memory: ${deleteError.message}`);
          return NextResponse.json(
            {
              error: "Failed to delete memory",
              success: false,
              details: deleteError.message,
            },
            { status: 500 }
          );
        }

        console.log(`Successfully deleted memory ${memoryId} completely`);
        return NextResponse.json({
          success: true,
          message:
            "Memory has been deleted completely as the associated course no longer exists",
        });
      } else {
        console.log(
          `Course ${memoryData.course_id} still exists - will just update isLongterm flag`
        );
      }
    } else {
      console.log(`Memory ${memoryId} has no course_id`);
    }

    console.log(`Updating memory ${memoryId} to set is_longterm=false`);

    if (memoryData.is_longterm !== (memoryData.metadata?.isLongterm === true)) {
      console.log(
        `Memory ${memoryId} has inconsistent long-term flags, fixing both`
      );
      console.log(
        `Current state: is_longterm=${memoryData.is_longterm}, metadata.isLongterm=${memoryData.metadata?.isLongterm}`
      );
    }

    const updatedMetadata = {
      ...memoryData.metadata,
      isLongterm: false,
    };

    const { error: updateError } = await supabaseServer
      .from("ai_memories")
      .update({
        is_longterm: false,
        metadata: updatedMetadata,
      })
      .eq("id", memoryId);

    if (updateError) {
      console.error(`Error updating memory: ${updateError.message}`);
      return NextResponse.json(
        {
          error: "Failed to forget memory",
          success: false,
          details: updateError.message,
        },
        { status: 500 }
      );
    }

    console.log(`Successfully updated memory ${memoryId} to is_longterm=false`);
    return NextResponse.json({
      success: true,
      message: "Memory has been forgotten (isLongterm set to false)",
    });
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        success: false,
        details:
          error instanceof Error
            ? error.message
            : "Unknown error in memory API",
        stack:
          process.env.NODE_ENV === "development"
            ? error instanceof Error
              ? error.stack
              : undefined
            : undefined,
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const { courseId, userMessage, userId } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required", success: false },
        { status: 400 }
      );
    }

    if (!courseId) {
      return NextResponse.json(
        { error: "Course ID is required", success: false },
        { status: 400 }
      );
    }

    if (!userMessage) {
      return NextResponse.json(
        { error: "User message is required", success: false },
        { status: 400 }
      );
    }

    const validation = await validateUserId(userId);
    if (!validation.valid && validation.error) {
      return NextResponse.json(
        {
          error: validation.error.message,
          success: false,
          details: validation.error.details,
        },
        { status: validation.error.status }
      );
    }

    const result = await getVectorStore();
    if (!result) {
      console.error("Database client initialization failed");
      return NextResponse.json(
        {
          error: "Database connection failed",
          success: false,
          details: "Vector store initialization returned null",
        },
        { status: 500 }
      );
    }

    let client;
    if (result instanceof SupabaseVectorStore) {
      client = (result as any).client;
    } else if ("from" in result) {
      client = result as SupabaseClient;
    } else {
      console.error("Invalid vector store structure");
      return NextResponse.json(
        {
          error: "Database client missing required methods",
          success: false,
          details: "Could not extract a valid client from the vector store",
        },
        { status: 500 }
      );
    }

    if (!client || typeof client.from !== "function") {
      console.error("Invalid database client");
      return NextResponse.json(
        {
          error: "Database client missing required methods",
          success: false,
          details:
            "Client is missing the 'from' method required for database access",
        },
        { status: 500 }
      );
    }

    const { data: memories, error: searchError } = await client
      .from("ai_memories")
      .select("id, content, metadata, course_id, created_at")
      .eq("user_id", userId)
      .eq("course_id", courseId)
      .order("created_at", { ascending: false });

    if (searchError) {
      console.error("Error searching memories:", searchError);
      return NextResponse.json(
        {
          error: "Failed to search memories",
          success: false,
          details: searchError.message,
        },
        { status: 500 }
      );
    }

    if (!memories || memories.length === 0) {
      console.log(`No memories found for course: ${courseId}`);
      return NextResponse.json(
        {
          error: "No memories found for this course",
          success: false,
          details: `No memories exist for course ID: ${courseId}`,
        },
        { status: 404 }
      );
    }

    console.log(
      `Found ${memories.length} memories for course, searching for best match...`
    );

    let bestMatch = null;
    let bestScore = -1;

    const normalizedUserMessage = userMessage.replace(/\s+/g, "").toLowerCase();
    console.log(
      `Normalized user message to match: ${normalizedUserMessage.substring(
        0,
        50
      )}...`
    );

    for (const memory of memories) {
      try {
        const parts = memory.content.split("\nAI:");
        if (parts.length >= 1) {
          const userPart = parts[0].replace("USER:", "").trim();

          console.log(`Comparing with memory ${memory.id}:`);
          console.log(`- Memory USER part: ${userPart.substring(0, 50)}...`);
          console.log(`- Looking for: ${userMessage.substring(0, 50)}...`);

          if (userPart === userMessage) {
            console.log(`EXACT MATCH FOUND: Memory ID ${memory.id}`);
            return NextResponse.json({
              memoryId: memory.id,
              success: true,
            });
          }

          const normalizedContent = userPart.replace(/\s+/g, "").toLowerCase();

          let score = 0;

          if (
            normalizedContent.includes(normalizedUserMessage) ||
            normalizedUserMessage.includes(normalizedContent)
          ) {
            score += 1000;
          }

          const searchSubstring = normalizedUserMessage.substring(
            0,
            Math.min(50, normalizedUserMessage.length)
          );

          if (normalizedContent.includes(searchSubstring)) {
            score += 500;

            const matchPercent =
              searchSubstring.length / normalizedUserMessage.length;
            score += Math.floor(matchPercent * 100);
          }

          if (score > 0) {
            console.log(`Potential match (score ${score}): ${memory.id}`);
          }

          if (score > bestScore) {
            bestScore = score;
            bestMatch = memory;
          }
        }
      } catch (error) {
        console.error(`Error parsing memory ${memory.id}:`, error);
      }
    }

    if (!bestMatch) {
      for (const memory of memories) {
        const normalizedContent = memory.content
          .replace(/\s+/g, "")
          .toLowerCase();

        const searchSubstring = normalizedUserMessage.substring(
          0,
          Math.min(30, normalizedUserMessage.length)
        );

        if (normalizedContent.includes(searchSubstring)) {
          const score = memory.content.length;

          console.log(`Fallback match (score ${score}): ${memory.id}`);

          if (score > bestScore) {
            bestScore = score;
            bestMatch = memory;
          }
        }
      }
    }

    if (bestMatch) {
      console.log(
        `Found best memory match: ${bestMatch.id} (score: ${bestScore})`
      );
      return NextResponse.json({
        memoryId: bestMatch.id,
        success: true,
      });
    }

    console.log(`No matching memory found for message in course: ${courseId}`);
    return NextResponse.json(
      {
        error: "No matching memory found for this message",
        success: false,
        details: "Message content did not match any stored memories",
      },
      { status: 404 }
    );
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        success: false,
        details:
          error instanceof Error ? error.message : "Unknown error occurred",
        stack:
          process.env.NODE_ENV === "development"
            ? error instanceof Error
              ? error.stack
              : undefined
            : undefined,
      },
      { status: 500 }
    );
  }
}
