import { NextResponse } from "next/server";
import { createServerClient } from "@/utils/supabase-server";
import { getVectorStore } from "@/lib/vectorstore";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";

// Updated interface to reflect new schema
interface MemoryRow {
  content: string;
  metadata: {
    conversationId: string;
    userId?: string;
    timestamp: number;
    type: string;
    isLongterm: boolean;
    created_at?: string;
  };
}

export async function GET(request: Request) {
  try {
    // Get query parameters
    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get("conversationId");
    const userId = searchParams.get("userId");

    // Check database connectivity
    try {
      const supabaseServer = await createServerClient();
      const { data: testData, error: testError } = await supabaseServer
        .from("profiles")
        .select("id")
        .limit(1);

      if (testError) {
        console.error("Database connection test failed:", testError);
        return NextResponse.json(
          { error: "Database connection failed", details: testError.message },
          { status: 500 }
        );
      }
    } catch (dbError) {
      console.error("Error during database connection test:", dbError);
      return NextResponse.json(
        {
          error: "Error during database connection test",
          details: (dbError as Error).message,
        },
        { status: 500 }
      );
    }

    // Check that we have a conversationId
    if (!conversationId) {
      return NextResponse.json(
        { error: "Conversation ID is required" },
        { status: 400 }
      );
    }

    // Validate the user ID if provided
    let validatedUserId: string | undefined = undefined;

    if (userId) {
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
        } else {
          validatedUserId = userId;
        }
      } catch (error) {
        console.error("Error validating user ID:", error);
      }
    }

    if (!validatedUserId) {
      console.log(
        "Invalid user ID provided, continuing with conversation ID only"
      );
    }

    try {
      // Initialize vector store
      const vectorStore = await getVectorStore();
      if (!vectorStore) {
        return NextResponse.json(
          { error: "Vector store initialization failed" },
          { status: 500 }
        );
      }

      let resultRows: MemoryRow[] = [];

      // Check if we have a proper vector store or just a Supabase client
      if (vectorStore instanceof SupabaseVectorStore) {
        const supabaseClient = (vectorStore as any).client;

        // Query conversation-based memories using the metadata field
        const { data: conversationResultRows, error: conversationQueryError } =
          await supabaseClient
            .from("ai_memories")
            .select("content, metadata")
            .filter("metadata->>'conversationId'", "eq", conversationId)
            .order("metadata->>'timestamp'", { ascending: true });

        if (conversationQueryError) {
          console.error(
            "Database query error for conversation memories:",
            conversationQueryError
          );
        } else {
          resultRows = conversationResultRows || [];
        }
      } else if (vectorStore && "from" in vectorStore) {
        // Use Supabase client directly
        console.log(
          "⚠️ FALLBACK: Using direct Supabase queries for history retrieval (no embeddings)"
        );

        // Query conversation-based memories using the metadata field
        const { data: conversationResultRows, error: queryError } =
          await vectorStore
            .from("ai_memories")
            .select("content, metadata")
            .filter("metadata->>'conversationId'", "eq", conversationId)
            .order("metadata->>'timestamp'", { ascending: true });

        resultRows = conversationResultRows || [];

        if (queryError) {
          console.error("Database query error:", queryError);
          throw queryError;
        }
      }

      // Process the results to extract user and AI messages
      const history = [];

      for (const row of resultRows) {
        try {
          const content = row.content;
          // Each content should be in the format "USER: message\nAI: response"
          const parts = content.split("\nAI: ");

          if (parts.length !== 2) {
            // Skip malformed entries
            continue;
          }

          const userMessage = parts[0].replace("USER: ", "");
          const aiResponse = parts[1];

          // Get timestamp from metadata
          const timestamp = row.metadata.timestamp || Date.now();

          // Add to history array
          history.push({
            userMessage,
            aiResponse,
            timestamp,
          });
        } catch (error) {
          // Skip entries that can't be parsed
          console.error("Error parsing history entry:", error);
        }
      }

      // Return the processed history
      return NextResponse.json({
        history,
        success: true,
      });
    } catch (error) {
      console.error("Error retrieving history:", error);
      return NextResponse.json(
        {
          error: "Database connection error",
          message:
            "Could not connect to the database. Using localStorage fallback.",
          success: false,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("History API Error:", error);
    return NextResponse.json(
      { error: "Internal server error", success: false },
      { status: 500 }
    );
  }
}
