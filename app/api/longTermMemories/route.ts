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
        const { data, error } = await supabaseServer
          .from("ai_memories")
          .select("content, metadata, created_at")
          .eq("user_id", userId)
          .eq("is_longterm", true)
          .order("created_at", { ascending: false });

        if (error) {
          console.error("Database query error:", error);
          return NextResponse.json(
            {
              error: "Failed to retrieve memories from database",
              success: false,
            },
            { status: 500 }
          );
        }

        if (!data || data.length === 0) {
          return NextResponse.json({
            memories: [],
            count: 0,
            success: true,
          });
        }

        // Process the memories
        const processedMemories = data.map((item) => {
          try {
            const content = item.content;
            const parts = content.split("\nAI: ");

            if (parts.length !== 2) {
              return {
                content,
                timestamp:
                  item.metadata.timestamp ||
                  new Date(item.created_at).getTime(),
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
            };
          } catch (error) {
            console.error("Error parsing memory:", error);
            return {
              content: item.content,
              timestamp:
                item.metadata.timestamp || new Date(item.created_at).getTime(),
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

      // Process the memories into a more readable format
      const processedMemories = memories.map((memory) => {
        try {
          const content = memory.pageContent;
          // Each content should be in the format "USER: message\nAI: response"
          const parts = content.split("\nAI: ");

          if (parts.length !== 2) {
            // Return as-is for malformed entries
            return { content, timestamp: memory.metadata.timestamp };
          }

          const userMessage = parts[0].replace("USER: ", "");
          const aiResponse = parts[1];

          return {
            userMessage,
            aiResponse,
            timestamp: memory.metadata.timestamp,
            type: memory.metadata.type || "chat",
          };
        } catch (error) {
          // Return raw content for entries that can't be parsed
          console.error("Error parsing memory entry:", error);
          return {
            content: memory.pageContent,
            timestamp: memory.metadata.timestamp,
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
