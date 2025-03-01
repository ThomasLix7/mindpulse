import { NextResponse } from "next/server";
import { createServerClient } from "@/utils/supabase-server";

// Interface for conversation data
export interface Conversation {
  id: string;
  title: string;
  created_at?: string;
  updated_at?: string;
  is_archived?: boolean;
}

// GET all conversations for a user
export async function GET(request: Request) {
  try {
    // Get the user ID from query params
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

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

    // Delete the conversation (this will cascade delete the related memories)
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
      message: "Conversation deleted successfully",
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
