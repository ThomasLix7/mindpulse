import { NextResponse } from "next/server";
import { createServerClient } from "@/utils/supabase-server";
import { getVectorStore } from "@/lib/vectorstore";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";

interface MemoryRow {
  content: string;
  metadata: {
    userId?: string;
    sessionId: string;
    timestamp: number;
    type: string;
  };
}

export async function POST(request: Request) {
  try {
    // Parse the request
    const { sessionId, userId } = await request.json();

    console.log("Received userId:", userId);

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
      } else {
        console.log("Database connection test successful:", testData);
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

    // Check that we have a sessionId
    if (!sessionId) {
      return NextResponse.json(
        { error: "Session ID is required" },
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
        "In history, Invalid user ID provided, continuing with session ID only"
      );
    } else {
      console.log(
        `In history Attempting to retrieve memories for session: ${sessionId} and user: ${validatedUserId}`
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

      let resultRows: any[] = [];

      // Check if we have a proper vector store or just a Supabase client
      if (vectorStore instanceof SupabaseVectorStore) {
        // Use the supabase client from the vector store
        console.log(
          "✅ Using vector store with embeddings for history retrieval"
        );
        const supabaseClient = (vectorStore as any).client;

        // Query session-based memories
        const { data: sessionResultRows, error: sessionQueryError } =
          await supabaseClient
            .from("ai_memories")
            .select("content, metadata")
            .filter("metadata->>'sessionId'", "eq", sessionId)
            .order("metadata->>'timestamp'", { ascending: false });

        if (sessionQueryError) {
          console.error(
            "Database query error for session memories:",
            sessionQueryError
          );
        } else {
          resultRows = sessionResultRows || [];
        }

        // Query user-based memories if we have a valid user ID
        if (validatedUserId) {
          const { data: userResultRows, error: userQueryError } =
            await supabaseClient
              .from("ai_memories")
              .select("content, metadata")
              .filter("metadata->>'userId'", "eq", validatedUserId)
              .order("metadata->>'timestamp'", { ascending: false });

          if (userQueryError) {
            console.error(
              "Database query error for user memories:",
              userQueryError
            );
          } else if (userResultRows) {
            // Add user memories to the beginning (they're more relevant)
            resultRows.unshift(...userResultRows);
          }
        }
      } else if (vectorStore && "from" in vectorStore) {
        // Use Supabase client directly
        console.log(
          "⚠️ FALLBACK: Using direct Supabase queries for history retrieval (no embeddings)"
        );
        const { data: sessionResultRows, error: queryError } = await vectorStore
          .from("ai_memories")
          .select("content, metadata")
          .filter("metadata->>'sessionId'", "eq", sessionId)
          .order("metadata->>'timestamp'", { ascending: false });

        resultRows = sessionResultRows || [];

        if (validatedUserId) {
          const { data: userResultRows, error: userQueryError } =
            await vectorStore
              .from("ai_memories")
              .select("content, metadata")
              .filter("metadata->>'userId'", "eq", validatedUserId)
              .order("metadata->>'timestamp'", { ascending: false });

          if (!userQueryError && userResultRows) {
            resultRows.unshift(...userResultRows);
          }
        }

        if (queryError) {
          console.error("Database query error:", queryError);
          throw queryError;
        }
      }

      // Process the results to extract user and AI messages
      const history = [];

      for (const row of resultRows as MemoryRow[]) {
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

          // Add to history array
          history.push({
            userMessage,
            aiResponse,
            timestamp: row.metadata.timestamp,
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
