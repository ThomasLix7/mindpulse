import { NextResponse } from "next/server";
import { createServerClient } from "@/utils/supabase-server";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { getVectorStore } from "@/lib/vectorstore";
import { SupabaseClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  try {
    // Parse the request
    const { conversationId, userMessage, userId } = await request.json();

    // Validate required parameters
    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required", success: false },
        { status: 400 }
      );
    }

    if (!conversationId) {
      return NextResponse.json(
        { error: "Conversation ID is required", success: false },
        { status: 400 }
      );
    }

    if (!userMessage) {
      return NextResponse.json(
        { error: "User message is required", success: false },
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
        return NextResponse.json(
          {
            error: "Invalid user ID",
            success: false,
            details: profileError ? profileError.message : "User not found",
          },
          { status: 403 }
        );
      }
    } catch (error) {
      console.error("Error validating user ID:", error);
      return NextResponse.json(
        {
          error: "User validation failed",
          success: false,
          details:
            error instanceof Error ? error.message : "Unknown validation error",
        },
        { status: 500 }
      );
    }

    // Get vector store or Supabase client to interact with database
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

    // Extract the Supabase client from different possible structures
    let client;
    if (result instanceof SupabaseVectorStore) {
      console.log("Using client from SupabaseVectorStore");
      client = (result as any).client;
    } else if ("from" in result) {
      console.log("Using direct Supabase client");
      client = result as SupabaseClient;
    } else {
      console.error("Invalid vector store structure");
      console.log("Vector store type:", typeof result);
      console.log("Vector store properties:", Object.keys(result));
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

    // Create a normalized version of the user message for matching
    const normalizedUserMessage = userMessage.replace(/\s+/g, "").toLowerCase();

    try {
      console.log(
        `Finding memory for message in conversation: ${conversationId}`
      );

      // Format of content in the database: "USER: {message}\nAI: {response}"
      // We need to search for the user message part
      const { data: memories, error: searchError } = await client
        .from("ai_memories")
        .select("id, content, created_at")
        .eq("user_id", userId)
        .eq("conversation_id", conversationId)
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
        console.log(`No memories found for conversation: ${conversationId}`);
        return NextResponse.json(
          {
            error: "No memories found for this conversation",
            success: false,
            details: `No memories exist for conversation ID: ${conversationId}`,
          },
          { status: 404 }
        );
      }

      console.log(
        `Found ${memories.length} memories for conversation, searching for best match...`
      );

      // Find the memory that contains the user message
      let bestMatch = null;
      let bestScore = -1;

      for (const memory of memories) {
        // Extract the user part from "USER: {message}\nAI: {response}"
        const normalizedContent = memory.content
          .replace(/\s+/g, "")
          .toLowerCase();

        // Check if memory content contains the start of the user message (partial match)
        // Using a substring of userMessage for more reliable matching
        const searchSubstring = normalizedUserMessage.substring(
          0,
          Math.min(30, normalizedUserMessage.length)
        );

        if (normalizedContent.includes(searchSubstring)) {
          // Simple scoring based on memory length (for consistent results)
          const score = memory.content.length;

          // Log the potential match
          console.log(`Potential match (score ${score}): ${memory.id}`);
          console.log(
            `Content substring: ${memory.content.substring(0, 50)}...`
          );

          if (score > bestScore) {
            bestScore = score;
            bestMatch = memory;
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

      console.log(
        `No matching memory found for message in conversation: ${conversationId}`
      );
      return NextResponse.json(
        {
          error: "No matching memory found for this message",
          success: false,
          details: "Message content did not match any stored memories",
        },
        { status: 404 }
      );
    } catch (queryError) {
      console.error("Database query error:", queryError);
      return NextResponse.json(
        {
          error: "Database error while searching memories",
          success: false,
          details:
            queryError instanceof Error
              ? queryError.message
              : "Unknown database error",
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
