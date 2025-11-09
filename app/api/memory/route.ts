import { NextResponse } from "next/server";
import { createServerClient } from "@/utils/supabase-server";

async function validateUserId(userId: string, accessToken?: string) {
  if (!userId) {
    return {
      valid: false,
      error: {
        message: "User ID is required",
        details: "Missing userId parameter",
        status: 400,
      },
    };
  }

  try {
    const supabaseServer = await createServerClient(accessToken);

    const { data: profileData, error: profileError } = await supabaseServer
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .single();

    if (profileError || !profileData) {
      return {
        valid: false,
        error: {
          message: "Invalid user ID",
          details: profileError ? profileError.message : "User not found",
          status: 403,
        },
      };
    }

    return { valid: true, error: undefined };
  } catch (error) {
    console.error("Error validating user ID:", error);
    return {
      valid: false,
      error: {
        message: "User validation failed",
        details:
          error instanceof Error ? error.message : "Unknown validation error",
        status: 500,
      },
    };
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        {
          error: "User ID is required for long-term memory access",
          success: false,
        },
        { status: 400 }
      );
    }

    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Authorization token required", success: false },
        { status: 401 }
      );
    }

    const accessToken = authHeader.substring(7);
    const supabase = await createServerClient(accessToken);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(accessToken);

    if (authError || !user) {
      return NextResponse.json(
        { error: "Invalid access token", success: false },
        { status: 401 }
      );
    }

    if (user.id !== userId) {
      return NextResponse.json(
        { error: "User ID mismatch", success: false },
        { status: 403 }
      );
    }

    const validation = await validateUserId(userId, accessToken);
    if (!validation.valid && validation.error) {
      return NextResponse.json(
        { error: validation.error.message, success: false },
        { status: validation.error.status }
      );
    }

    try {
      const supabaseServer = await createServerClient(accessToken);

      const { data: memoriesData, error: memoriesError } = await supabaseServer
        .from("ai_memories")
        .select("id, content, metadata, created_at, memory_type")
        .eq("user_id", userId)
        .eq("is_longterm", true)
        .order("created_at", { ascending: false });

      if (memoriesError) {
        console.error("Error querying long-term memories:", memoriesError);
        return NextResponse.json(
          { error: "Failed to retrieve long-term memories", success: false },
          { status: 500 }
        );
      }

      if (!memoriesData || memoriesData.length === 0) {
        return NextResponse.json({
          memories: [],
          count: 0,
          success: true,
        });
      }

      const processedMemories = memoriesData.map((item) => {
        try {
          const content = item.content;
          const memoryType = item.memory_type;
          const timestamp =
            item.metadata?.timestamp || new Date(item.created_at).getTime();

          // Learning insights (long-term memories with memory_type)
          if (memoryType && memoryType !== "course_summary") {
            return {
              content,
              memoryType,
              timestamp,
              id: item.id,
              type: "insight",
            };
          }

          // Conversation memories (format: "USER: ...\nAI: ...")
          const parts = content.split("\nAI: ");
          if (parts.length === 2) {
            const userMessage = parts[0].replace("USER: ", "");
            const aiResponse = parts[1];
            return {
              userMessage,
              aiResponse,
              timestamp,
              type: item.metadata?.type || "chat",
              id: item.id,
              memoryType: null,
            };
          }

          // Fallback: content-only memory
          return {
            content,
            timestamp,
            id: item.id,
            memoryType: memoryType || null,
          };
        } catch (error) {
          console.error("Error parsing memory:", error);
          return {
            content: item.content,
            timestamp:
              item.metadata?.timestamp || new Date(item.created_at).getTime(),
            id: item.id,
            memoryType: item.memory_type || null,
          };
        }
      });

      return NextResponse.json({
        memories: processedMemories,
        count: processedMemories.length,
        success: true,
      });
    } catch (error) {
      console.error("Error retrieving long-term memories:", error);
      return NextResponse.json(
        { error: "Failed to retrieve long-term memories", success: false },
        { status: 500 }
      );
    }
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
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");
    const memoryId = url.searchParams.get("memoryId");

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

    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Authorization token required", success: false },
        { status: 401 }
      );
    }

    const accessToken = authHeader.substring(7);
    const supabase = await createServerClient(accessToken);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(accessToken);

    if (authError || !user) {
      return NextResponse.json(
        { error: "Invalid access token", success: false },
        { status: 401 }
      );
    }

    if (user.id !== userId) {
      return NextResponse.json(
        { error: "User ID mismatch", success: false },
        { status: 403 }
      );
    }

    const validation = await validateUserId(userId, accessToken);
    if (!validation.valid && validation.error) {
      return NextResponse.json(
        {
          error: validation.error.message,
          success: false,
          details: validation.error.details,
        },
        { status: validation.error.status }
      );
    }

    const supabaseServer = await createServerClient(accessToken);

    const { data: memoryData, error: memoryError } = await supabaseServer
      .from("ai_memories")
      .select("user_id, metadata, course_id, is_longterm")
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

    if (memoryData.course_id) {
      const { data: courseData, error: courseError } = await supabaseServer
        .from("courses")
        .select("id")
        .eq("id", memoryData.course_id)
        .single();

      if (courseError) {
        console.error(`Error finding course: ${courseError.message}`);
      }

      if (!courseData) {
        const { error: deleteError } = await supabaseServer
          .from("ai_memories")
          .delete()
          .eq("id", memoryId);

        if (deleteError) {
          console.error(`Error deleting memory: ${deleteError.message}`);
          return NextResponse.json(
            {
              error: "Failed to delete memory",
              success: false,
              details: deleteError.message,
            },
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          message:
            "Memory has been deleted completely as the associated course no longer exists",
        });
      }
    }

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
      console.error(`Error updating memory: ${updateError.message}`);
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
    console.error("API Error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        success: false,
        details:
          error instanceof Error
            ? error.message
            : "Unknown error in memory API",
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
