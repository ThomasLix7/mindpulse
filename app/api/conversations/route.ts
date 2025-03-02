import { NextResponse } from "next/server";
import { createServerClient } from "@/utils/supabase-server";
import { getVectorStore } from "@/lib/vectorstore";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";

// Interface for conversation data
export interface Conversation {
  id: string;
  title: string;
  created_at?: string;
  updated_at?: string;
  is_archived?: boolean;
}

// Interface for memory rows from the database
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

// GET all conversations for a user
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

    // Verify the user exists
    const supabase = await createServerClient();
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
      return await getConversationHistory(conversationId, userId);
    }

    // Get all conversations for the user
    const { data: conversations, error } = await supabase
      .from("conversations")
      .select("*")
      .eq("user_id", userId)
      .eq("is_archived", false)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("Error fetching conversations:", error);
      return NextResponse.json(
        { error: "Failed to fetch conversations" },
        { status: 500 }
      );
    }

    // If includeHistory is true, fetch history for each conversation
    if (includeHistory && conversations) {
      try {
        const conversationsWithHistory = await Promise.all(
          conversations.map(async (conv) => {
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

        return NextResponse.json({
          conversations: conversationsWithHistory,
          success: true,
        });
      } catch (error) {
        console.error("Error fetching conversations with history:", error);
        // Fall back to just returning conversations without history
      }
    }

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

// Helper function to get conversation history
async function getConversationHistory(conversationId: string, userId: string) {
  try {
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
}

// Create a new conversation
export async function POST(request: Request) {
  try {
    const { title, userId } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    // Create a new conversation
    const supabase = await createServerClient();
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

// Update an existing conversation
export async function PUT(request: Request) {
  try {
    const { id, title, is_archived, userId } = await request.json();

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
    const updateData: { title?: string; is_archived?: boolean } = {};
    if (title !== undefined) updateData.title = title;
    if (is_archived !== undefined) updateData.is_archived = is_archived;

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

// DELETE a conversation
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
