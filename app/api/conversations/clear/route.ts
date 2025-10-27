import { NextResponse } from "next/server";
import { createServerClient } from "@/utils/supabase-server";

export async function POST(request: Request) {
  try {
    // Parse the request body
    const body = await request.json();
    const { conversationId, userId } = body;

    if (!conversationId || !userId) {
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
      .eq("id", conversationId)
      .eq("user_id", userId)
      .single();

    if (fetchError || !existingConv) {
      return NextResponse.json(
        { error: "Conversation not found or access denied" },
        { status: 403 }
      );
    }

    // 1. Delete only the non-long-term memories for this conversation
    const { error: memoryDeleteError } = await supabase
      .from("ai_memories")
      .delete()
      .eq("conversation_id", conversationId)
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
      .eq("conversation_id", conversationId)
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
        .eq("conversation_id", conversationId)
        .eq("is_longterm", true);

      if (memoryUpdateError) {
        console.error(
          "Error preserving long-term memories:",
          memoryUpdateError
        );
      }
    }

    return NextResponse.json({
      message:
        "Conversation history cleared successfully (long-term memories preserved)",
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
