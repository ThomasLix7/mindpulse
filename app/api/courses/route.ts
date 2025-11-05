import { NextResponse } from "next/server";
import { createServerClient } from "@/utils/supabase-server";
import { getVectorStore } from "@/lib/vectorstore";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";

export interface Course {
  id: string;
  title: string;
  created_at?: string;
  updated_at?: string;
}

interface MemoryRow {
  content: string;
  metadata: {
    courseId: string;
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
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const courseId = searchParams.get("courseId");
    const includeHistory = searchParams.get("includeHistory") === "true";

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Authorization token required" },
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
        { error: "Invalid access token" },
        { status: 401 }
      );
    }

    if (user.id !== userId) {
      return NextResponse.json({ error: "User ID mismatch" }, { status: 403 });
    }

    const { data: userData, error: userError } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .single();

    if (userError || !userData) {
      return NextResponse.json({ error: "Invalid user ID" }, { status: 403 });
    }

    if (courseId) {
      const { data: course, error: pathError } = await supabase
        .from("courses")
        .select("*")
        .eq("id", courseId)
        .eq("user_id", userId)
        .single();

      if (pathError || !course) {
        return NextResponse.json(
          { error: "Course not found", success: false },
          { status: 404 }
        );
      }

      const historyResponse = await getCourseHistory(
        courseId,
        userId,
        accessToken
      );
      const historyData = await historyResponse.json();

      return NextResponse.json({
        course: {
          ...course,
          history: historyData.history || [],
        },
        success: true,
        isNewCourse: historyData.isNewCourse || false,
      });
    }

    const { data: courses, error } = await supabase
      .from("courses")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("Error fetching courses:", error);
      return NextResponse.json(
        { error: "Failed to fetch courses" },
        { status: 500 }
      );
    }

    if (includeHistory && courses) {
      console.log(
        `Fetching history for ${courses.length} courses (requested with includeHistory)`
      );
      try {
        const coursesToFetch = courses.slice(0, 5);

        const coursesWithHistory = await Promise.all(
          coursesToFetch.map(async (course) => {
            const historyResponse = await getCourseHistory(
              course.id,
              userId,
              accessToken
            );
            const historyData = await historyResponse.json();

            return {
              ...course,
              history: historyData.success ? historyData.history : [],
            };
          })
        );

        const remainingCourses = courses.slice(5).map((course) => ({
          ...course,
          history: [],
        }));

        return NextResponse.json({
          courses: [...coursesWithHistory, ...remainingCourses],
          success: true,
        });
      } catch (error) {
        console.error("Error fetching courses with history:", error);
      }
    }

    return NextResponse.json({
      courses,
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

async function getCourseHistory(
  courseId: string,
  userId: string,
  accessToken: string
) {
  try {
    if (!courseId) {
      return NextResponse.json(
        { error: "Course ID is required" },
        { status: 400 }
      );
    }

    const vectorStore = await getVectorStore(accessToken);
    if (!vectorStore) {
      console.error("Vector store initialization failed");
      return NextResponse.json(
        { error: "Vector store initialization failed" },
        { status: 500 }
      );
    }

    let resultRows: MemoryRow[] = [];
    let history: any[] = [];

    if (vectorStore instanceof SupabaseVectorStore) {
      const supabaseClient = (vectorStore as any).client;

      const limit = 50;

      const query = supabaseClient
        .from("course_messages")
        .select("role, content, created_at")
        .eq("course_id", courseId)
        .order("created_at", { ascending: false })
        .limit(limit);

      const { data: courseMessages, error: messagesError } = await query;

      if (messagesError) {
        console.error("Error fetching course_messages:", messagesError);
      }

      let sortedMessages: any[] = [];

      if (!messagesError && courseMessages?.length) {
        sortedMessages = [...courseMessages].reverse();

        let currentUserMessage = "";
        let lastUserTimestamp: number | null = null;

        for (const msg of sortedMessages) {
          const msgTimestamp = new Date(msg.created_at).getTime();

          if (msg.role === "user") {
            if (currentUserMessage && lastUserTimestamp) {
              history.push({
                userMessage: currentUserMessage,
                aiResponse: "",
                timestamp: lastUserTimestamp,
                is_longterm: false,
              });
            }
            currentUserMessage = msg.content;
            lastUserTimestamp = msgTimestamp;
          } else if (msg.role === "assistant" || msg.role === "model") {
            history.push({
              userMessage: currentUserMessage || "",
              aiResponse: msg.content,
              timestamp: msgTimestamp,
              is_longterm: false,
            });
            currentUserMessage = "";
            lastUserTimestamp = null;
          }
        }

        if (currentUserMessage && lastUserTimestamp) {
          history.push({
            userMessage: currentUserMessage,
            aiResponse: "",
            timestamp: lastUserTimestamp,
            is_longterm: false,
          });
        }
      }

      const { data: columnResultRows, error: columnQueryError } =
        await supabaseClient
          .from("ai_memories")
          .select("content, metadata, created_at, is_longterm, user_id")
          .eq("course_id", courseId)
          .order("created_at", { ascending: true });

      if (!columnQueryError && columnResultRows?.length) {
        resultRows = columnResultRows;
      } else {
        const { data: metadataResultRows, error: metadataQueryError } =
          await supabaseClient
            .from("ai_memories")
            .select("content, metadata, created_at, is_longterm, user_id")
            .filter("metadata->>'courseId'", "eq", courseId)
            .or(
              "metadata->>'learningPathId'.eq." +
                courseId +
                ",metadata->>'conversationId'.eq." +
                courseId
            )
            .order("metadata->>'timestamp'", { ascending: true });

        if (!metadataQueryError && metadataResultRows?.length) {
          resultRows = metadataResultRows;
        }
      }

      if (history.length > 0) {
        return NextResponse.json({
          history,
          success: true,
          isNewCourse: false,
        });
      }

      return NextResponse.json({
        history: [],
        success: true,
        isNewCourse: true,
      });
    }

    for (const row of resultRows) {
      try {
        if (!row || !row.content) {
          console.warn("Skipping invalid history row:", row);
          continue;
        }

        const content = row.content;
        const parts = content.split("\nAI: ");

        if (parts.length !== 2) {
          console.warn(
            `Skipping malformed content entry: ${content.substring(0, 50)}...`
          );
          continue;
        }

        const userMessage = parts[0].replace("USER: ", "");
        const aiResponse = parts[1];

        const timestamp =
          row.metadata?.timestamp ||
          (row.created_at ? new Date(row.created_at).getTime() : Date.now());

        history.push({
          userMessage,
          aiResponse,
          timestamp,
          is_longterm: row.is_longterm,
          metadata: row.metadata,
        });
      } catch (error) {
        console.error("Error parsing history entry:", error);
      }
    }

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
    const { title, userId, learningPathId } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    if (!learningPathId) {
      return NextResponse.json(
        { error: "Learning path ID is required" },
        { status: 400 }
      );
    }

    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Authorization token required" },
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
        { error: "Invalid access token" },
        { status: 401 }
      );
    }

    if (user.id !== userId) {
      return NextResponse.json({ error: "User ID mismatch" }, { status: 403 });
    }
    const { data, error } = await supabase
      .from("courses")
      .insert({
        title: title || "New Course",
        user_id: userId,
        learning_path_id: learningPathId,
        curriculum: { lessons: [] },
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating course:", error);
      return NextResponse.json(
        { error: "Failed to create course" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      course: data,
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
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const userId = searchParams.get("userId");

    if (!id || !userId) {
      return NextResponse.json(
        { error: "Course ID and User ID are required" },
        { status: 400 }
      );
    }

    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Authorization token required" },
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
        { error: "Invalid access token" },
        { status: 401 }
      );
    }

    if (user.id !== userId) {
      return NextResponse.json({ error: "User ID mismatch" }, { status: 403 });
    }

    const { data: existingCourse, error: fetchError } = await supabase
      .from("courses")
      .select("id")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (fetchError || !existingCourse) {
      return NextResponse.json(
        { error: "Course not found or access denied" },
        { status: 403 }
      );
    }

    const { error: memoryDeleteError } = await supabase
      .from("ai_memories")
      .delete()
      .eq("course_id", id)
      .eq("is_longterm", false);

    if (memoryDeleteError) {
      console.error("Error deleting course memories:", memoryDeleteError);
      return NextResponse.json(
        { error: "Failed to delete course memories" },
        { status: 500 }
      );
    }

    const { data: longTermMemories, error: longTermCheckError } = await supabase
      .from("ai_memories")
      .select("id")
      .eq("course_id", id)
      .eq("is_longterm", true);

    if (longTermCheckError) {
      console.error(
        "Error checking for long-term memories:",
        longTermCheckError
      );
    } else if (longTermMemories && longTermMemories.length > 0) {
      console.log(
        `Preserving ${longTermMemories.length} long-term memories by removing course reference`
      );

      const { error: memoryUpdateError } = await supabase
        .from("ai_memories")
        .update({ course_id: null })
        .eq("course_id", id)
        .eq("is_longterm", true);

      if (memoryUpdateError) {
        console.error(
          "Error preserving long-term memories:",
          memoryUpdateError
        );
      }
    }

    const { error } = await supabase.from("courses").delete().eq("id", id);

    if (error) {
      console.error("Error deleting course:", error);
      return NextResponse.json(
        { error: "Failed to delete course" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: "Course deleted successfully (long-term memories preserved)",
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
