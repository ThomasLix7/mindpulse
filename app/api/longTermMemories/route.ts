import { NextResponse } from "next/server";
import { createServerClient } from "@/utils/supabase-server";
import { recallLongTermMemory } from "@/utils/memory";

export async function POST(request: Request) {
  try {
    // Parse the request
    const { userId, query } = await request.json();

    // Check that we have a userId
    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required for long-term memory access" },
        { status: 400 }
      );
    }

    // Validate the user ID
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
        return NextResponse.json({ error: "Invalid user ID" }, { status: 403 });
      }
    } catch (error) {
      console.error("Error validating user ID:", error);
      return NextResponse.json(
        { error: "User validation failed" },
        { status: 500 }
      );
    }

    // If no query is provided or a special "all" query, get all memories directly
    if (
      !query ||
      query.trim() === "" ||
      query.toLowerCase() === "all memories"
    ) {
      try {
        // Get all long-term memories directly from the database using the new schema
        const supabaseServer = await createServerClient();

        // First try with the direct column
        const { data: directData, error: directError } = await supabaseServer
          .from("ai_memories")
          .select("id, content, metadata, created_at")
          .eq("user_id", userId)
          .eq("is_longterm", true)
          .order("created_at", { ascending: false });

        if (directError) {
          console.error("Error querying with is_longterm column:", directError);
        }

        // Also try with the metadata field for backward compatibility
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

        // Combine results and remove duplicates
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
          // Add only non-duplicate entries
          metadataData.forEach((item) => {
            if (!allData.some((existing) => existing.id === item.id)) {
              allData.push(item);
            }
          });
        }

        // Log combined results
        console.log(`Total combined long-term memories: ${allData.length}`);

        if (allData.length === 0) {
          return NextResponse.json({
            memories: [],
            count: 0,
            success: true,
          });
        }

        // Process the memories
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

    // If we reach here, use the vector search with the provided query
    const searchQuery = query || "personal information";

    try {
      // Retrieve long-term memories - recallLongTermMemory has already been updated
      const memories = await recallLongTermMemory(userId, searchQuery);

      // Log the number of memories found by the vector search
      console.log(`Vector search found ${memories.length} long-term memories`);

      // If vector search didn't find anything, try a direct database query as fallback
      if (memories.length === 0) {
        console.log(
          "Vector search found no results, falling back to direct query"
        );

        const supabaseServer = await createServerClient();

        // First try with the direct column
        const { data: directData, error: directError } = await supabaseServer
          .from("ai_memories")
          .select("id, content, metadata, created_at")
          .eq("user_id", userId)
          .eq("is_longterm", true)
          .order("created_at", { ascending: false });

        if (directError) {
          console.error("Error querying with is_longterm column:", directError);
        }

        // Also try with the metadata field for backward compatibility
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

        // Combine results
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
          // Add only non-duplicate entries
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

          // Convert to Document format
          const directMemories = allData.map((item) => ({
            pageContent: item.content,
            metadata: {
              ...item.metadata,
              timestamp: item.created_at
                ? new Date(item.created_at).getTime()
                : Date.now(),
            },
          }));

          // Process these memories instead
          const processedMemories = directMemories.map((memory) => {
            try {
              const content = memory.pageContent;
              // Each content should be in the format "USER: message\nAI: response"
              const parts = content.split("\nAI: ");

              if (parts.length !== 2) {
                // Return as-is for malformed entries
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
              // Return raw content for entries that can't be parsed
              console.error("Error parsing memory entry:", error);
              return {
                content: memory.pageContent,
                timestamp: memory.metadata.timestamp,
                id: memory.metadata.id,
              };
            }
          });

          // Return these memories
          return NextResponse.json({
            memories: processedMemories,
            count: processedMemories.length,
            success: true,
          });
        }
      }

      // Process the memories into a more readable format
      const processedMemories = memories.map((memory) => {
        try {
          // Extract user and AI parts from memory
          const content = memory.pageContent || "";
          const metadataId = memory.metadata?.id || ""; // Get ID from metadata

          // Each content should be in the format "USER: message\nAI: response"
          const parts = content.split("\nAI: ");

          if (parts.length !== 2) {
            return {
              content,
              timestamp: memory.metadata?.timestamp || Date.now(),
              id: metadataId, // Include the memory ID
            };
          }

          const userMessage = parts[0].replace("USER: ", "");
          const aiResponse = parts[1];

          return {
            userMessage,
            aiResponse,
            timestamp: memory.metadata?.timestamp || Date.now(),
            type: memory.metadata?.type || "chat",
            id: metadataId, // Include the memory ID
          };
        } catch (error) {
          console.error("Error parsing memory:", error);
          return {
            content: memory.pageContent || "",
            timestamp: memory.metadata?.timestamp || Date.now(),
            id: memory.metadata?.id || "", // Include the memory ID
          };
        }
      });

      // Return the processed memories
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
