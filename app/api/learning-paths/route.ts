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

async function analyzeRequiredSkills(learningPath: {
  title: string;
  goal: string;
  domain?: string;
  subject?: string;
  level: string;
}): Promise<string[]> {
  const prompt = `Analyze the following learning path and identify ALL the specific skills, knowledge areas, and competencies that are needed to achieve this goal.

LEARNING PATH:
- Title: ${learningPath.title}
- Goal: ${learningPath.goal}
- Domain: ${learningPath.domain || "General"}
- Subject: ${learningPath.subject || "General"}
- Target Level: ${learningPath.level}

Return ONLY a JSON array of skill names (strings), nothing else. Focus on concrete, specific skills rather than vague concepts. Be comprehensive but precise. Examples:
- For "Learn React": ["JavaScript", "HTML", "CSS", "React", "JSX", "Component Lifecycle", "State Management", "Hooks", "Props"]
- For "Become a Data Scientist": ["Python", "Data Analysis", "Statistics", "Machine Learning", "Pandas", "NumPy", "Data Visualization", "SQL"]

Return ONLY valid JSON array, no markdown formatting, no explanations.`;

  try {
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    let jsonText = responseText.trim();

    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.replace(/```json\n?/g, "").replace(/```\n?$/g, "");
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/```\n?/g, "");
    }

    const skills = JSON.parse(jsonText);
    return Array.isArray(skills) ? skills : [];
  } catch (error) {
    console.error("Error analyzing required skills:", error);
    return [];
  }
}

function assessUserCurrentLevel(
  userSkills: any[],
  userProfile: any,
  domain?: string,
  subject?: string
): string {
  const relevantSkills = userSkills.filter((skill) => {
    if (!domain && !subject) return true;
    const skillLower = (skill.skill_name || "").toLowerCase();
    const categoryLower = (skill.category || "").toLowerCase();
    const domainLower = (domain || "").toLowerCase();
    const subjectLower = (subject || "").toLowerCase();
    return (
      skillLower.includes(domainLower) ||
      skillLower.includes(subjectLower) ||
      categoryLower.includes(domainLower) ||
      categoryLower.includes(subjectLower)
    );
  });

  if (relevantSkills.length === 0) {
    return userProfile?.education_level || "beginner";
  }

  const proficiencyLevels = relevantSkills.map((s) => {
    const level = s.proficiency_level?.toLowerCase() || "beginner";
    return level === "intermediate" ? "medium" : level;
  });

  const levelMap: { [key: string]: number } = {
    beginner: 1,
    medium: 2,
    intermediate: 2,
    advanced: 3,
    expert: 4,
  };

  const averageLevel =
    proficiencyLevels.reduce((sum, level) => sum + (levelMap[level] || 1), 0) /
    proficiencyLevels.length;

  if (averageLevel >= 3.5) return "expert";
  if (averageLevel >= 2.5) return "advanced";
  if (averageLevel >= 1.5) return "medium";
  return "beginner";
}

async function generateCurriculum(context: {
  learningPath: any;
  userProfile: any;
  userSkills: any[];
  memories: string[];
}): Promise<CurriculumStructure> {
  const targetLevel = context.learningPath.level || "medium";
  const currentLevel = assessUserCurrentLevel(
    context.userSkills,
    context.userProfile,
    context.learningPath.domain,
    context.learningPath.subject
  );

  const relevantSkillsSummary = context.userSkills
    .filter((skill) => {
      if (!context.learningPath.domain && !context.learningPath.subject)
        return true;
      const skillLower = (skill.skill_name || "").toLowerCase();
      const categoryLower = (skill.category || "").toLowerCase();
      const domainLower = (context.learningPath.domain || "").toLowerCase();
      const subjectLower = (context.learningPath.subject || "").toLowerCase();
      return (
        skillLower.includes(domainLower) ||
        skillLower.includes(subjectLower) ||
        categoryLower.includes(domainLower) ||
        categoryLower.includes(subjectLower)
      );
    })
    .map((s) => `${s.skill_name} (${s.proficiency_level})`)
    .join(", ");

  const prompt = `You are an expert educational curriculum designer. Generate a detailed, structured learning curriculum that progressively builds from the user's current level to the target level.

LEARNING PATH:
- Title: ${context.learningPath.title}
- Goal: ${context.learningPath.goal}
- Domain: ${context.learningPath.domain || "General"}
- Subject: ${context.learningPath.subject || "General"}
- Target Level: ${targetLevel}

USER'S CURRENT LEVEL ASSESSMENT:
- Current Level: ${currentLevel}
- Education Level: ${context.userProfile?.education_level || "Not specified"}
- Relevant Skills: ${relevantSkillsSummary || "None identified"}
- User Profile: ${JSON.stringify(context.userProfile, null, 2)}

USER SKILLS (Full List):
${JSON.stringify(context.userSkills, null, 2)}

RELEVANT MEMORIES:
${context.memories.join("\n")}

CRITICAL INSTRUCTIONS:
1. Start from the user's CURRENT LEVEL (${currentLevel}), not the target level. The courses must build upon what the user already knows and can do.
2. Progressively advance through the curriculum from ${currentLevel} → medium → advanced → expert (or appropriate progression) until reaching the TARGET LEVEL (${targetLevel}).
3. The first course should review and reinforce foundational concepts relevant to the user's current skills, then gradually introduce new concepts.
4. Each subsequent course should build on the previous one, creating a logical learning progression.
5. Do NOT jump to advanced topics immediately - the curriculum must bridge the gap between current and target levels.
6. Consider the user's existing skills (${
    relevantSkillsSummary || "none"
  }) and build upon them.

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
Course titles should NOT include prefixes like "Course 1:", "Course 2:", etc.
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

    const { data: learningPaths, error: pathsError } = await supabase
      .from("learning_paths")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });

    if (pathsError) {
      console.error("Error fetching learning paths:", pathsError);
      return NextResponse.json(
        { error: "Failed to fetch learning paths" },
        { status: 500 }
      );
    }

    const { data: courses, error: coursesError } = await supabase
      .from("courses")
      .select(
        "id, title, learning_path_id, course_order, curriculum, current_lesson_index, current_topic_index, current_topic_id, completed_topic_ids, metadata, created_at, updated_at"
      )
      .eq("user_id", userId)
      .order("learning_path_id, course_order", { ascending: true });

    if (coursesError) {
      console.error("Error fetching courses:", coursesError);
      return NextResponse.json(
        { error: "Failed to fetch courses" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      learningPaths: learningPaths || [],
      courses: courses || [],
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
    const {
      title,
      goal,
      userId,
      domain,
      subject,
      level,
      confirmedSkills,
      learningPathId,
    } = await request.json();

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

    if (confirmedSkills && learningPathId) {
      if (!title || !goal) {
        return NextResponse.json(
          { error: "Title and goal are required for curriculum generation" },
          { status: 400 }
        );
      }

      const { data: learningPath, error: pathError } = await supabase
        .from("learning_paths")
        .select("*")
        .eq("id", learningPathId)
        .eq("user_id", userId)
        .single();

      if (pathError || !learningPath) {
        return NextResponse.json(
          { error: "Learning path not found" },
          { status: 404 }
        );
      }

      const [profileResult, memoriesResult] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", userId).single(),
        supabase
          .from("ai_memories")
          .select("content, metadata")
          .eq("user_id", userId)
          .eq("is_longterm", true)
          .limit(20),
      ]);

      const profile = profileResult.data || {};
      const memories = memoriesResult.data || [];

      try {
        const curriculum = await generateCurriculum({
          learningPath: {
            title: learningPath.title,
            goal: learningPath.goal,
            domain: learningPath.domain,
            subject: learningPath.subject,
            level: learningPath.level || "medium",
          },
          userProfile: profile,
          userSkills: confirmedSkills,
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
    }

    if (!title || !goal) {
      return NextResponse.json(
        { error: "Title and goal are required" },
        { status: 400 }
      );
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

    const [profileResult, skillsResult] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).single(),
      supabase.from("user_skills").select("*").eq("user_id", userId),
    ]);

    const profile = profileResult.data || {};
    const existingSkills = skillsResult.data || [];

    try {
      const requiredSkills = await analyzeRequiredSkills({
        title,
        goal,
        domain,
        subject,
        level: level || "medium",
      });

      const skillMatches = requiredSkills.map((skillName: string) => {
        const normalizedSkill = skillName.toLowerCase().trim();
        const matched = existingSkills.find((existing) => {
          const existingName = (existing.skill_name || "").toLowerCase().trim();
          return (
            existingName === normalizedSkill ||
            existingName.includes(normalizedSkill) ||
            normalizedSkill.includes(existingName)
          );
        });

        return {
          skillName,
          hasExistingData: !!matched,
          currentLevel: matched?.proficiency_level || null,
          skillId: matched?.id || null,
        };
      });

      return NextResponse.json({
        learningPath,
        requiredSkills: skillMatches,
        success: true,
        phase: "skill_assessment",
      });
    } catch (error) {
      console.error("Error analyzing required skills:", error);
      return NextResponse.json({
        learningPath,
        success: true,
        warning: "Skill analysis failed, but learning path created",
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
