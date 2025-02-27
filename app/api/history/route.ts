import { NextResponse } from "next/server";
import { createServerClient } from "@/utils/supabase-server";
import { getVectorStore } from "@/lib/vectorstore";
import { PGVectorStore } from "@langchain/community/vectorstores/pgvector";

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

    // Check database connectivity (NEW TEST)
    try {
      const supabaseServer = await createServerClient();
      const { data: testData, error: testError } = await supabaseServer
        .from("profiles")
        .select("id")
        .limit(1); // Just fetch one row to test the connection

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
        // Create a Supabase client
        const supabaseServer = await createServerClient();

        // Check if this user exists in the profiles table
        const { data: profileData, error: profileError } = await supabaseServer
          .from("profiles")
          .select("id")
          .eq("id", userId)
          .single();

        console.log("profileError:", profileError);
        console.log("profileData:", profileData);

        if (profileError || !profileData) {
          console.log(
            `User ID ${userId} not found in profiles table:`,
            profileError
          );
          // We continue without the user ID, falling back to session-based memory only
        } else {
          // User ID is valid and exists in the profiles table
          validatedUserId = userId;
        }
      } catch (error) {
        console.error("Error validating user ID:", error);
        // Continue without the user ID
      }
    }

    if (!validatedUserId) {
      console.log(
        "in history, Invalid user ID provided, continuing with session ID only"
      );
    } else {
      console.log(
        `in history Attempting to retrieve memories for session: ${sessionId} and user: ${validatedUserId}`
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

      // Build query based on whether we have a valid user ID
      let whereClause: string;
      let parameters: string[];

      if (validatedUserId) {
        whereClause = "metadata->>'userId' = $1 OR metadata->>'sessionId' = $2";
        parameters = [validatedUserId, sessionId];
      } else {
        whereClause = "metadata->>'sessionId' = $1";
        parameters = [sessionId];
      }

      // Access the client directly using the proper method for PGVectorStore
      // For direct query access
      // const pgStore = vectorStore as PGVectorStore;
      // const client = await pgStore.pool.connect();

      try {
        // Use vectorStore (which is now SupabaseClient) directly for query
        let resultRows: any[] = []; // Initialize resultRows as empty array
        const { data: sessionResultRows, error: queryError } = await vectorStore
          .from("ai_memories")
          .select("content, metadata")
          .filter("metadata->>'sessionId'", "eq", parameters[0]) // Use filter with parameters directly
          .order("metadata->>'timestamp'", { ascending: false }); // Simplified order clause

        resultRows = sessionResultRows || []; // Use sessionResultRows and default to empty array if null

        if (validatedUserId) {
          const { data: userResultRows, error: userQueryError } =
            await vectorStore
              .from("ai_memories")
              .select("content, metadata")
              .filter("metadata->>'userId'", "eq", parameters[0]) // Use filter with userId
              .order("metadata->>'timestamp'", { ascending: false }); // Simplified order clause

          if (userQueryError) {
            console.error(
              "Database query error for user memories:",
              userQueryError
            );
          }
          // Combine results - user memories should come first (more relevant)
          resultRows.unshift(...(userResultRows || [])); // Add user memories to the beginning
        }

        if (queryError) {
          console.error("Database query error:", queryError);
          throw queryError;
        }
        const result = { rows: resultRows || [] };

        // Process the results to extract user and AI messages
        const history = [];

        for (const row of result.rows as MemoryRow[]) {
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
      } finally {
        // Release the client back to the pool
        // client.release();
      }
    } catch (error) {
      console.error("Error initializing vector store:", error);
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
