import { NextResponse } from "next/server";
import { createServerClient } from "@/utils/supabase-server";

export async function POST(request: Request) {
  try {
    // Parse the request
    const { memoryId, userId } = await request.json();

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

    if (!memoryId) {
      return NextResponse.json(
        {
          error: "Memory ID is required",
          success: false,
          details: "Missing memoryId parameter",
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

      // Check if memory exists and belongs to user
      const { data: memoryData, error: memoryError } = await supabaseServer
        .from("ai_memories")
        .select("user_id, metadata")
        .eq("id", memoryId)
        .single();

      if (memoryError || !memoryData) {
        console.error("Error checking memory:", memoryError);
        return NextResponse.json(
          {
            error: "Memory not found",
            success: false,
            details: memoryError ? memoryError.message : "Memory not found",
          },
          { status: 404 }
        );
      }

      // Verify that the memory belongs to the user
      if (memoryData.user_id !== userId) {
        return NextResponse.json(
          {
            error: "Unauthorized",
            success: false,
            details: "This memory does not belong to the user",
          },
          { status: 403 }
        );
      }

      // Update memory to set is_longterm = false
      const updatedMetadata = {
        ...memoryData.metadata,
        isLongterm: false,
      };

      const { error: updateError } = await supabaseServer
        .from("ai_memories")
        .update({
          is_longterm: false,
          metadata: updatedMetadata,
        })
        .eq("id", memoryId);

      if (updateError) {
        console.error("Error forgetting memory:", updateError);
        return NextResponse.json(
          {
            error: "Failed to forget memory",
            success: false,
            details: updateError.message,
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: "Memory has been forgotten (isLongterm set to false)",
      });
    } catch (error) {
      console.error("Error forgetting memory:", error);
      return NextResponse.json(
        {
          error: "Internal server error",
          success: false,
          details:
            error instanceof Error ? error.message : "Unknown validation error",
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
            : "Unknown error in forgetMemory API",
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
