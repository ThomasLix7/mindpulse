import { NextResponse } from "next/server";
import { createServerClient } from "@/utils/supabase-server";
import { getVectorStore } from "@/lib/vectorstore";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";

export interface Conversation {
  id: string;
  title: string;
  created_at?: string;
  updated_at?: string;
}

interface MemoryRow {
  content: string;
  metadata: {
    conversationId: string;
    userId?: string;
    timestamp: number;
    type: string;
    isLongterm: boolean;
  };
  created_at?: string;
  is_longterm?: boolean;
  user_id?: string;
}

export async function GET(request: Request) {
  try {
    // Get the user ID from query params
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const conversationId = searchParams.get("conversationId");
    const includeHistory = searchParams.get("includeHistory") === "true";

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    // Get access token from Authorization header
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Authorization token required" },
        { status: 401 }
      );
    }

    const accessToken = authHeader.substring(7); // Remove "Bearer " prefix

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

    // Verify the user exists
    const { data: userData, error: userError } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .single();

    if (userError || !userData) {
      return NextResponse.json({ error: "Invalid user ID" }, { status: 403 });
    }

    // If a specific conversation history is requested
    if (conversationId) {
      // First get the conversation metadata
      const { data: conversation, error: convError } = await supabase
        .from("conversations")
        .select("*")
        .eq("id", conversationId)
        .eq("user_id", userId)
        .single();

      if (convError || !conversation) {
        return NextResponse.json(
          { error: "Conversation not found", success: false },
          { status: 404 }
        );
      }

      // Get the history
      const historyResponse = await getConversationHistory(
        conversationId,
        userId
      );
      const historyData = await historyResponse.json();

      // Return both the conversation and its history
      return NextResponse.json({
        conversation: {
          ...conversation,
          history: historyData.history || [],
        },
        success: true,
        isNewConversation: historyData.isNewConversation || false,
      });
    }

    // Get all conversations for the user
    const { data: conversations, error } = await supabase
      .from("conversations")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("Error fetching conversations:", error);
      return NextResponse.json(
        { error: "Failed to fetch conversations" },
        { status: 500 }
      );
    }

    // If includeHistory is true, fetch history for each conversation
    // But ONLY if explicitly requested to avoid unnecessary database queries
    if (includeHistory && conversations) {
      console.log(
        `Fetching history for ${conversations.length} conversations (requested with includeHistory)`
      );
      try {
        // Limit the number of conversations we load history for to avoid overloading the database
        const conversationsToFetch = conversations.slice(0, 5); // Only fetch history for the 5 most recent

        const conversationsWithHistory = await Promise.all(
          conversationsToFetch.map(async (conv) => {
            const historyResponse = await getConversationHistory(
              conv.id,
              userId
            );
            const historyData = await historyResponse.json();

            return {
              ...conv,
              history: historyData.success ? historyData.history : [],
            };
          })
        );

        // For the remaining conversations, include them without history
        const remainingConversations = conversations.slice(5).map((conv) => ({
          ...conv,
          history: [],
        }));

        return NextResponse.json({
          conversations: [
            ...conversationsWithHistory,
            ...remainingConversations,
          ],
          success: true,
        });
      } catch (error) {
        console.error("Error fetching conversations with history:", error);
        // Fall back to just returning conversations without history
      }
    }

    // Return conversations without history (more efficient)
    return NextResponse.json({
      conversations,
      success: true,
    });
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json(
      { error: "Internal server error", success: false },
      { status: 500 }
    );
  }
}

async function getConversationHistory(conversationId: string, userId: string) {
  try {
    // Log that we're fetching history
    console.log(
      `Fetching history for conversation ${conversationId} for user ${userId}`
    );

    // Check that we have a conversationId
    if (!conversationId) {
      return NextResponse.json(
        { error: "Conversation ID is required" },
        { status: 400 }
      );
    }

    // Initialize vector store
    const vectorStore = await getVectorStore();
    if (!vectorStore) {
      console.error("Vector store initialization failed");
      return NextResponse.json(
        { error: "Vector store initialization failed" },
        { status: 500 }
      );
    }

    // Log vector store type
    console.log(`Vector store type: ${vectorStore.constructor.name}`);

    let resultRows: MemoryRow[] = [];
    let history: any[] = [];

    // Check if we have a proper vector store or just a Supabase client
    if (vectorStore instanceof SupabaseVectorStore) {
      const supabaseClient = (vectorStore as any).client;

      // Method 1: Use the dedicated conversation_id column
      const { data: columnResultRows, error: columnQueryError } =
        await supabaseClient
          .from("ai_memories")
          .select("content, metadata, created_at, is_longterm, user_id")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: true });

      if (columnQueryError) {
        console.error(
          "Database query error using conversation_id column:",
          columnQueryError
        );
      } else if (columnResultRows && columnResultRows.length > 0) {
        resultRows = columnResultRows;
      } else {
        console.log(
          "No records found using conversation_id column, trying metadata"
        );

        // Method 2: Try the legacy metadata.conversationId approach as fallback
        const { data: metadataResultRows, error: metadataQueryError } =
          await supabaseClient
            .from("ai_memories")
            .select("content, metadata, created_at, is_longterm, user_id")
            .filter("metadata->>'conversationId'", "eq", conversationId)
            .order("metadata->>'timestamp'", { ascending: true });

        if (metadataQueryError) {
          console.error(
            "Database query error using metadata.conversationId:",
            metadataQueryError
          );
        } else if (metadataResultRows && metadataResultRows.length > 0) {
          resultRows = metadataResultRows;
        } else {
          console.log("No records found with either method");
        }
      }
      return NextResponse.json({
        history: [],
        success: true,
        isNewConversation: true,
      });
    }

    // Process the history
    for (const row of resultRows) {
      try {
        if (!row || !row.content) {
          console.warn("Skipping invalid history row:", row);
          continue;
        }

        const content = row.content;
        // Each content should be in the format "USER: message\nAI: response"
        const parts = content.split("\nAI: ");

        if (parts.length !== 2) {
          // Skip malformed entries
          console.warn(
            `Skipping malformed content entry: ${content.substring(0, 50)}...`
          );
          continue;
        }

        const userMessage = parts[0].replace("USER: ", "");
        const aiResponse = parts[1];

        // Get timestamp from metadata or created_at
        const timestamp =
          row.metadata?.timestamp ||
          (row.created_at ? new Date(row.created_at).getTime() : Date.now());

        // Add to history array with longterm status
        history.push({
          userMessage,
          aiResponse,
          timestamp,
          is_longterm: row.is_longterm,
          metadata: row.metadata,
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
}

export async function POST(request: Request) {
  try {
    const { title, userId } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    // Get access token from Authorization header
    const authHeader = request.headers.get("Authorization");
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
    const { data, error } = await supabase
      .from("conversations")
      .insert({
        title: title || "New Conversation",
        user_id: userId,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating conversation:", error);
      return NextResponse.json(
        { error: "Failed to create conversation" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      conversation: data,
      success: true,
    });
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json(
      { error: "Internal server error", success: false },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const { id, title, userId } = await request.json();

    if (!id || !userId) {
      return NextResponse.json(
        { error: "Conversation ID and User ID are required" },
        { status: 400 }
      );
    }

    // Verify the user owns this conversation
    const supabase = await createServerClient();
    const { data: existingConv, error: fetchError } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (fetchError || !existingConv) {
      return NextResponse.json(
        { error: "Conversation not found or access denied" },
        { status: 403 }
      );
    }

    // Update the conversation
    const updateData: { title?: string } = {};
    if (title !== undefined) updateData.title = title;

    const { data, error } = await supabase
      .from("conversations")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating conversation:", error);
      return NextResponse.json(
        { error: "Failed to update conversation" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      conversation: data,
      success: true,
    });
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json(
      { error: "Internal server error", success: false },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    // Get the conversation ID and user ID from query params
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const userId = searchParams.get("userId");

    if (!id || !userId) {
      return NextResponse.json(
        { error: "Conversation ID and User ID are required" },
        { status: 400 }
      );
    }

    // Verify the user owns this conversation
    const supabase = await createServerClient();
    const { data: existingConv, error: fetchError } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (fetchError || !existingConv) {
      return NextResponse.json(
        { error: "Conversation not found or access denied" },
        { status: 403 }
      );
    }

    // Handle memory deletion more carefully to preserve long-term memories

    // 1. Delete only the non-long-term memories for this conversation
    const { error: memoryDeleteError } = await supabase
      .from("ai_memories")
      .delete()
      .eq("conversation_id", id)
      .eq("is_longterm", false);

    if (memoryDeleteError) {
      console.error("Error deleting conversation memories:", memoryDeleteError);
      return NextResponse.json(
        { error: "Failed to delete conversation memories" },
        { status: 500 }
      );
    }

    // 2. For long-term memories, just remove the conversation_id reference
    const { data: longTermMemories, error: longTermCheckError } = await supabase
      .from("ai_memories")
      .select("id")
      .eq("conversation_id", id)
      .eq("is_longterm", true);

    if (longTermCheckError) {
      console.error(
        "Error checking for long-term memories:",
        longTermCheckError
      );
    } else if (longTermMemories && longTermMemories.length > 0) {
      console.log(
        `Preserving ${longTermMemories.length} long-term memories by removing conversation reference`
      );

      const { error: memoryUpdateError } = await supabase
        .from("ai_memories")
        .update({ conversation_id: null })
        .eq("conversation_id", id)
        .eq("is_longterm", true);

      if (memoryUpdateError) {
        console.error(
          "Error preserving long-term memories:",
          memoryUpdateError
        );
      }
    }

    // 3. Now delete the conversation
    const { error } = await supabase
      .from("conversations")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting conversation:", error);
      return NextResponse.json(
        { error: "Failed to delete conversation" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message:
        "Conversation deleted successfully (long-term memories preserved)",
      success: true,
    });
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json(
      { error: "Internal server error", success: false },
      { status: 500 }
    );
  }
}
