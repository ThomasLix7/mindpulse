import { NextResponse } from "next/server";
import { createServerClient } from "@/utils/supabase-server";
import { saveToLongTermMemory } from "@/utils/memory";

export async function POST(request: Request) {
  try {
    // Parse the request
    const { memoryId, userId, userMessage, aiResponse } = await request.json();

    // Validate required parameters
    if (!userId) {
      return NextResponse.json(
        {
          error: "User ID is required",
          success: false,
          details: "Missing userId parameter",
        },
        { status: 400 }
      );
    }

    // We need either a memoryId OR (userMessage AND aiResponse)
    if (!memoryId && (!userMessage || !aiResponse)) {
      return NextResponse.json(
        {
          error:
            "Either memory ID or both user message and AI response are required",
          success: false,
          details: "Invalid or missing parameters",
        },
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

    // Create options object based on provided parameters
    const options: {
      memoryId?: string;
      userMessage?: string;
      aiResponse?: string;
    } = {};

    if (memoryId) {
      options.memoryId = memoryId;
    }

    if (userMessage && aiResponse) {
      options.userMessage = userMessage;
      options.aiResponse = aiResponse;
    }

    // Log the request for debugging
    console.log("Attempting to save to long-term memory:", {
      userId,
      memoryId: options.memoryId,
      hasUserMessage: !!options.userMessage,
      hasAiResponse: !!options.aiResponse,
    });

    // Save to long-term memory using the unified function
    const success = await saveToLongTermMemory(userId, options);

    if (success) {
      return NextResponse.json({
        success: true,
        message: "Memory has been saved to long-term memory",
      });
    } else {
      // Enhanced error response when saving fails
      return NextResponse.json(
        {
          success: false,
          error: "Failed to save memory to long-term",
          details: memoryId
            ? `Failed to promote memory ID: ${memoryId}`
            : "Failed to create or find similar memory",
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
          error instanceof Error
            ? error.message
            : "Unknown error in longTermMemory API",
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
