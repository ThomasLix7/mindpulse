import { NextResponse } from "next/server";
import { model } from "@/lib/gemini";
import { createServerClient } from "@/utils/supabase-server";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { courseId, userId, topic, lessonTitle, lessonIndex, topicIndex } =
      body;

    if (!courseId || !userId || !topic) {
      return NextResponse.json(
        { error: "Course ID, user ID, and topic are required" },
        { status: 400 }
      );
    }

    const authHeader = req.headers.get("Authorization");
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

    const { data: existingAssessments, error: checkError } = await supabase
      .from("assessments")
      .select("id, status, metadata")
      .eq("course_id", courseId)
      .eq("user_id", userId)
      .eq("status", "in_progress")
      .limit(1);

    if (checkError) {
      console.error("Error checking for existing assessments:", checkError);
    }

    if (existingAssessments && existingAssessments.length > 0) {
      const existingAssessment = existingAssessments[0];
      return NextResponse.json(
        {
          error: "An assessment is already in progress for this course",
          existingAssessmentId: existingAssessment.id,
          message:
            "Please complete the current assessment before starting a new one.",
        },
        { status: 409 }
      );
    }

    // Fetch course and learning path info
    const { data: courseInfo } = await supabase
      .from("courses")
      .select("title, description, curriculum, learning_path_id")
      .eq("id", courseId)
      .eq("user_id", userId)
      .single();

    let learningPathInfo = null;
    if (courseInfo?.learning_path_id) {
      const { data: learningPath } = await supabase
        .from("learning_paths")
        .select("title, goal, subject, domain, level")
        .eq("id", courseInfo.learning_path_id)
        .single();
      learningPathInfo = learningPath;
    }

    // Get lesson description
    const lessons = courseInfo?.curriculum?.lessons || [];
    const currentLesson = lessons[lessonIndex || 0];
    const lessonDescription = currentLesson?.description || "";

    const assessmentPrompt = `You are an expert educational assessment designer. Generate a comprehensive assessment for the following topic based on the learning objectives and curriculum structure.

LEARNING CONTEXT:
${
  learningPathInfo
    ? `Learning Path: ${learningPathInfo.title}
Goal: ${learningPathInfo.goal}
Subject: ${learningPathInfo.subject || "General"}
Domain: ${learningPathInfo.domain || "General"}
Level: ${learningPathInfo.level || "intermediate"}`
    : ""
}

COURSE: ${courseInfo?.title || "Current Course"}
${
  courseInfo?.description ? `Course Description: ${courseInfo.description}` : ""
}

LESSON: ${lessonTitle || "Current Lesson"}
${lessonDescription ? `Lesson Description: ${lessonDescription}` : ""}

TOPIC TO ASSESS: ${topic}

REQUIREMENTS:
1. Identify ALL sub-concepts within this topic (e.g., if topic is "Python syntax and data structures", concepts might be: lists, dicts, tuples, sets, list comprehensions, etc.)
2. For EACH concept, generate AT LEAST 3 assessment items
3. Assessment items can test multiple concepts (e.g., an exercise combining lists and dicts)
4. Use diverse question types: multiple choice, short answer, coding exercises, true/false, fill-in-the-blank - choose what's best for each concept
5. Questions should be appropriate difficulty level and test genuine understanding

OUTPUT FORMAT (JSON only, no markdown):
{
  "concepts": ["concept1", "concept2", ...],
  "items": [
    {
      "item_order": 1,
      "item_type": "multiple_choice" | "short_answer" | "coding_exercise" | "true_false" | "fill_blank",
      "question_text": "The question or exercise prompt. For multiple_choice, ALWAYS include all options directly in the question text in this exact format: 'Question text? A) Option1 B) Option2 C) Option3 D) Option4'. Do NOT separate options into different fields.",
      "correct_answer": "For multiple_choice: the correct option letter (A, B, C, or D) or the full correct option text. For other types: the correct answer or expected output",
      "concepts": ["concept1", "concept2"],
      "level": "beginner" | "intermediate" | "advanced"
    },
    ...
  ]
}

Generate a comprehensive assessment. Return ONLY valid JSON.`;

    const result = await model.generateContent(assessmentPrompt);
    const responseText = result.response.text();

    let jsonText = responseText.trim();
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.replace(/```json\n?/g, "").replace(/```\n?$/g, "");
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/```\n?/g, "");
    }

    let assessmentData;
    try {
      assessmentData = JSON.parse(jsonText);
    } catch (error) {
      console.error("Error parsing assessment JSON:", error);
      console.error("Response text:", responseText);
      return NextResponse.json(
        { error: "Failed to generate valid assessment" },
        { status: 500 }
      );
    }

    // Create assessment record
    const { data: assessment, error: assessmentError } = await supabase
      .from("assessments")
      .insert({
        user_id: userId,
        course_id: courseId,
        assessment_type: "topic_assessment",
        status: "in_progress",
        total_items: assessmentData.items.length,
      })
      .select()
      .single();

    if (assessmentError || !assessment) {
      console.error("Error creating assessment:", assessmentError);
      return NextResponse.json(
        { error: "Failed to create assessment record" },
        { status: 500 }
      );
    }

    // Create assessment items
    const itemsToInsert = assessmentData.items.map(
      (item: any, index: number) => ({
        assessment_id: assessment.id,
        item_order: item.item_order || index + 1,
        item_type: item.item_type,
        question_text: item.question_text,
        correct_answer: item.correct_answer,
        level: item.level || "intermediate",
      })
    );

    const { error: itemsError } = await supabase
      .from("assessment_items")
      .insert(itemsToInsert);

    if (itemsError) {
      console.error("Error creating assessment items:", itemsError);
      // Assessment created, items can be added later
    }

    // Store concepts in assessment metadata
    await supabase
      .from("assessments")
      .update({
        metadata: {
          concepts: assessmentData.concepts,
          lessonIndex,
          topicIndex,
          topic,
          lessonTitle,
        },
      })
      .eq("id", assessment.id);

    // Cache assessment ID
    const { data: courseData } = await supabase
      .from("courses")
      .select("metadata")
      .eq("id", courseId)
      .single();

    const currentMetadata = courseData?.metadata || {};
    const {
      pending_assessment_topic,
      pending_assessment_lesson_index,
      pending_assessment_topic_index,
      ...cleanedMetadata
    } = currentMetadata;

    await supabase
      .from("courses")
      .update({
        metadata: {
          ...cleanedMetadata,
          in_progress_assessment_id: assessment.id,
          in_progress_assessment_topic: topic,
        },
      })
      .eq("id", courseId);

    return NextResponse.json({
      assessmentId: assessment.id,
      totalItems: assessmentData.items.length,
      concepts: assessmentData.concepts,
    });
  } catch (error: any) {
    console.error("Error generating assessment:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate assessment" },
      { status: 500 }
    );
  }
}
