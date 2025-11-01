import { NextResponse } from "next/server";
import { createServerClient } from "@/utils/supabase-server";
import { model } from "@/lib/gemini";

interface CurriculumStructure {
  courses: Array<{
    title: string;
    description?: string;
    lessons: Array<{
      title: string;
      description?: string;
      topics?: string[];
    }>;
  }>;
}

async function generateCurriculum(context: {
  learningPath: any;
  userProfile: any;
  userSkills: any[];
  memories: string[];
}): Promise<CurriculumStructure> {
  const prompt = `You are an expert educational curriculum designer. Generate a detailed, structured learning curriculum based on the following information:

LEARNING PATH:
- Title: ${context.learningPath.title}
- Goal: ${context.learningPath.goal}
- Domain: ${context.learningPath.domain || "General"}
- Subject: ${context.learningPath.subject || "General"}
- Level: ${context.learningPath.level}

USER PROFILE:
${JSON.stringify(context.userProfile, null, 2)}

USER SKILLS:
${JSON.stringify(context.userSkills, null, 2)}

RELEVANT MEMORIES:
${context.memories.join("\n")}

Generate a comprehensive curriculum structure in JSON format with the following structure:
{
  "courses": [
    {
      "title": "Course name",
      "description": "Course description",
      "lessons": [
        {
          "title": "Lesson name",
          "description": "Lesson description",
          "topics": ["topic1", "topic2"]
        }
      ]
    }
  ]
}

Generate as many courses, lessons, and topics as needed to comprehensively cover the learning path goal. The number should be appropriate for the complexity and scope of the learning objective - whether it needs 1 course or 20 courses, let the content requirements determine the structure. Each lesson should have clear, relevant topics. Return ONLY valid JSON, no markdown formatting.`;

  const result = await model.generateContent(prompt);
  const responseText = result.response.text();

  let jsonText = responseText.trim();
  if (jsonText.startsWith("```json")) {
    jsonText = jsonText.replace(/```json\n?/g, "").replace(/```\n?$/g, "");
  } else if (jsonText.startsWith("```")) {
    jsonText = jsonText.replace(/```\n?/g, "");
  }

  try {
    const curriculum = JSON.parse(jsonText) as CurriculumStructure;
    return curriculum;
  } catch (error) {
    console.error("Error parsing curriculum JSON:", error);
    console.error("Response text:", responseText);
    return {
      courses: [
        {
          title: "Introduction",
          description: "Get started with your learning path",
          lessons: [
            {
              title: "Welcome to Your Learning Path",
              description: "Introduction to the learning path",
              topics: ["Overview", "Goals"],
            },
          ],
        },
      ],
    };
  }
}

async function createCoursesFromCurriculum(
  supabase: any,
  learningPathId: string,
  userId: string,
  curriculum: CurriculumStructure
) {
  const coursesCreated = [];

  for (
    let courseIndex = 0;
    courseIndex < curriculum.courses.length;
    courseIndex++
  ) {
    const courseData = curriculum.courses[courseIndex];
    const courseCurriculum = {
      lessons: courseData.lessons.map((l) => ({
        title: l.title,
        description: l.description,
        topics: l.topics || [],
      })),
    };

    const { data: course, error: courseError } = await supabase
      .from("courses")
      .insert({
        title: courseData.title,
        description: courseData.description,
        learning_path_id: learningPathId,
        user_id: userId,
        course_order: courseIndex,
        curriculum: courseCurriculum,
        current_lesson_index: courseIndex === 0 ? 0 : -1,
        current_topic_index: 0,
      })
      .select()
      .single();

    if (courseError) {
      console.error("Error creating course:", courseError);
      continue;
    }

    coursesCreated.push({
      ...course,
      lessons: courseData.lessons,
    });
  }

  return coursesCreated;
}

export interface LearningPath {
  id: string;
  title: string;
  goal: string;
  description?: string;
  domain?: string;
  subject?: string;
  level?: string;
  created_at?: string;
  updated_at?: string;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const learningPathId = searchParams.get("learningPathId");

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

    if (learningPathId) {
      const { data: learningPath, error } = await supabase
        .from("learning_paths")
        .select("*")
        .eq("id", learningPathId)
        .eq("user_id", userId)
        .single();

      if (error || !learningPath) {
        return NextResponse.json(
          { error: "Learning path not found", success: false },
          { status: 404 }
        );
      }

      return NextResponse.json({
        learningPath,
        success: true,
      });
    }

    const { data: learningPaths, error } = await supabase
      .from("learning_paths")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("Error fetching learning paths:", error);
      return NextResponse.json(
        { error: "Failed to fetch learning paths" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      learningPaths,
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

export async function POST(request: Request) {
  try {
    const { title, goal, userId, domain, subject, level } =
      await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    if (!title || !goal) {
      return NextResponse.json(
        { error: "Title and goal are required" },
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

    const { data: learningPath, error: pathError } = await supabase
      .from("learning_paths")
      .insert({
        title,
        goal,
        domain,
        subject,
        level: level || "medium",
        user_id: userId,
      })
      .select()
      .single();

    if (pathError) {
      console.error("Error creating learning path:", pathError);
      return NextResponse.json(
        { error: "Failed to create learning path" },
        { status: 500 }
      );
    }

    const [profileResult, skillsResult, memoriesResult] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).single(),
      supabase.from("user_skills").select("*").eq("user_id", userId),
      supabase
        .from("ai_memories")
        .select("content, metadata")
        .eq("user_id", userId)
        .eq("is_longterm", true)
        .limit(20),
    ]);

    const profile = profileResult.data || {};
    const skills = skillsResult.data || [];
    const memories = memoriesResult.data || [];

    try {
      const curriculum = await generateCurriculum({
        learningPath: {
          title,
          goal,
          domain,
          subject,
          level: level || "medium",
        },
        userProfile: profile,
        userSkills: skills,
        memories: memories.map((m) => m.content),
      });

      const coursesCreated = await createCoursesFromCurriculum(
        supabase,
        learningPath.id,
        userId,
        curriculum
      );

      return NextResponse.json({
        learningPath,
        courses: coursesCreated,
        success: true,
      });
    } catch (error) {
      console.error("Error generating curriculum:", error);
      return NextResponse.json({
        learningPath,
        success: true,
        warning: "Curriculum generation failed, but learning path created",
      });
    }
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
    const { id, title, goal, userId, description } = await request.json();

    if (!id || !userId) {
      return NextResponse.json(
        { error: "Learning path ID and User ID are required" },
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

    if (authError || !user || user.id !== userId) {
      return NextResponse.json(
        { error: "Invalid access token" },
        { status: 401 }
      );
    }

    const { data: existingPath, error: fetchError } = await supabase
      .from("learning_paths")
      .select("id")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (fetchError || !existingPath) {
      return NextResponse.json(
        { error: "Learning path not found or access denied" },
        { status: 403 }
      );
    }

    const updateData: {
      title?: string;
      goal?: string;
      description?: string;
    } = {};
    if (title !== undefined) updateData.title = title;
    if (goal !== undefined) updateData.goal = goal;
    if (description !== undefined) updateData.description = description;

    const { data, error } = await supabase
      .from("learning_paths")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating learning path:", error);
      return NextResponse.json(
        { error: "Failed to update learning path" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      learningPath: data,
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
    const learningPathId = searchParams.get("learningPathId");
    const userId = searchParams.get("userId");

    if (!learningPathId || !userId) {
      return NextResponse.json(
        { error: "Learning path ID and User ID are required" },
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

    if (authError || !user || user.id !== userId) {
      return NextResponse.json(
        { error: "Invalid access token" },
        { status: 401 }
      );
    }

    const { data: existingPath, error: fetchError } = await supabase
      .from("learning_paths")
      .select("id")
      .eq("id", learningPathId)
      .eq("user_id", userId)
      .single();

    if (fetchError || !existingPath) {
      return NextResponse.json(
        { error: "Learning path not found or access denied" },
        { status: 403 }
      );
    }

    const { error: deleteError } = await supabase
      .from("learning_paths")
      .delete()
      .eq("id", learningPathId)
      .eq("user_id", userId);

    if (deleteError) {
      console.error("Error deleting learning path:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete learning path" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Learning path deleted successfully",
    });
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json(
      { error: "Internal server error", success: false },
      { status: 500 }
    );
  }
}
