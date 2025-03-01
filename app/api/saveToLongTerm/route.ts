import { NextResponse } from "next/server";
import { saveToLongTermMemory } from "@/utils/memory";
import { createServerClient } from "@/utils/supabase-server";

export async function POST(request: Request) {
  try {
    // Parse the request
    const { userMessage, aiResponse, userId } = await request.json();

    // Check that we have the required fields
    if (!userMessage || !aiResponse) {
      return NextResponse.json(
        { error: "User message and AI response are required" },
        { status: 400 }
      );
    }

    // User ID is required for long-term memory
    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required for long-term memory", success: false },
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
          { error: "Invalid user ID", success: false },
          { status: 400 }
        );
      }
    } catch (error) {
      console.error("Error validating user ID:", error);
      return NextResponse.json(
        { error: "Error validating user ID", success: false },
        { status: 500 }
      );
    }

    // Save to long-term memory using the dedicated function
    // Note: This function already works with the new schema since it uses saveMemory internally
    // The metadata now stores all the fields (userId, conversationId, isLongterm, etc.)
    const success = await saveToLongTermMemory(userId, userMessage, aiResponse);

    if (success) {
      return NextResponse.json({
        success: true,
        message: "Saved to long-term memory successfully",
      });
    } else {
      return NextResponse.json(
        {
          error: "Failed to save to long-term memory",
          success: false,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Save to long-term memory API Error:", error);
    return NextResponse.json(
      { error: "Internal server error", success: false },
      { status: 500 }
    );
  }
}
