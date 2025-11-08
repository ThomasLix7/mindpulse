import { NextResponse } from "next/server";
import { model } from "@/lib/gemini";
import { createServerClient } from "@/utils/supabase-server";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { assessmentId, answers, courseId, userId } = body;

    if (!assessmentId || !answers || !Array.isArray(answers)) {
      return NextResponse.json(
        { error: "Assessment ID and answers array are required" },
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

    // Get assessment and items
    const { data: assessment, error: assessmentError } = await supabase
      .from("assessments")
      .select("*")
      .eq("id", assessmentId)
      .eq("user_id", userId)
      .single();

    if (assessmentError || !assessment) {
      return NextResponse.json(
        { error: "Assessment not found" },
        { status: 404 }
      );
    }

    const { data: items, error: itemsError } = await supabase
      .from("assessment_items")
      .select("*")
      .eq("assessment_id", assessmentId)
      .order("item_order", { ascending: true });

    if (itemsError || !items || items.length === 0) {
      return NextResponse.json(
        { error: "Assessment items not found" },
        { status: 404 }
      );
    }

    // Extract concepts from assessment metadata
    const itemsWithConcepts = items.map((item) => {
      let concepts: string[] = [];
      const assessmentConcepts = assessment.metadata?.concepts;
      if (Array.isArray(assessmentConcepts)) {
        concepts = assessmentConcepts;
      }
      return { ...item, concepts };
    });

    // Evaluate answers
    const evaluationPrompt = `You are an expert educational assessor. Evaluate the following assessment answers with fairness and educational intent. Give partial credit when appropriate.

ASSESSMENT ITEMS AND CORRECT ANSWERS:
${itemsWithConcepts
  .map(
    (item, idx) =>
      `Item ${idx + 1} (ID: ${item.id}, ${item.item_type}): ${
        item.question_text
      }\nConcepts tested: ${item.concepts.join(", ")}\nCorrect Answer: ${
        item.correct_answer
      }\nUser Answer: ${answers[idx]?.answer || "No answer provided"}`
  )
  .join("\n\n")}

EVALUATION CRITERIA (be generous and educational):
1. Multiple Choice: Accept if user selected the correct option letter (A, B, C, D, E) OR the correct option text, even if formatting differs
2. True/False: Accept if answer is semantically correct (true/True/TRUE/yes/Yes/y, false/False/FALSE/no/No/n)
3. Short Answer: 
   - FULL CREDIT: Answer demonstrates understanding, even if wording differs
   - PARTIAL CREDIT (0.5-0.7): Answer shows partial understanding or gets most parts right but misses some details
   - Example: If question asks for types AND values AND explanation, but user gets types and values right but missing explanation = PARTIAL CREDIT
4. Coding Exercises:
   - FULL CREDIT: Code produces correct output or demonstrates correct logic, even if syntax/style differs slightly
   - PARTIAL CREDIT (0.5-0.8): Code shows correct approach/logic but has minor syntax errors, missing print statements, or incomplete implementation
   - Example: Logic is correct but \`data.insert[1](15)\` instead of \`data.insert(1, 15)\` = PARTIAL CREDIT (syntax error but correct method)
   - Example: Correct structure but missing one requirement (e.g., forgot to add new student) = PARTIAL CREDIT
5. Fill-in-the-Blank: Accept if answer is semantically correct, allowing for synonyms, typos (e.g., "turple" for "tuple"), or equivalent expressions

PARTIAL CREDIT GUIDELINES:
- Give 0.5-0.7 credit for short answers that demonstrate partial understanding
- Give 0.5-0.8 credit for coding exercises with correct logic but minor errors
- Give 0.3-0.5 credit for coding exercises with correct approach but incomplete
- Only mark as 0 (incorrect) if there's a fundamental misunderstanding or no attempt

GENERAL PRINCIPLE: Be generous - if the answer shows ANY understanding of the concept, give at least partial credit. Only mark as fully incorrect (0) if there's a clear fundamental misunderstanding, no attempt, or completely wrong approach.

For each item, determine:
1. Score (0.0 to 1.0): 1.0 = fully correct, 0.5-0.9 = partial credit, 0.0 = incorrect
2. Is the answer correct? (true if score >= 0.5, false if score < 0.5)
3. If incorrect or partial, what was the error/misunderstanding? (be specific, and use "You" or "Your" to refer to the student, NOT "User" or "User's")
4. What concepts does this item test? (use the concepts listed above)

OUTPUT FORMAT (JSON only):
{
  "evaluations": [
    {
      "item_id": "use the exact item ID from above (the UUID, not 'Item X')",
      "score": 0.0-1.0,
      "is_correct": true/false (true if score >= 0.5),
      "error_type": "description of error if incorrect/partial, null if fully correct. Use 'You' or 'Your' to refer to the student, NOT 'User' or 'User's'",
      "concepts": ["concept1", "concept2"]
    },
    ...
  ],
  "failed_concepts": ["concept1", "concept2"] // All unique concepts from items with score < 0.5
}`;

    const result = await model.generateContent(evaluationPrompt);
    const responseText = result.response.text();

    let jsonText = responseText.trim();
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.replace(/```json\n?/g, "").replace(/```\n?$/g, "");
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/```\n?/g, "");
    }

    let evaluationData: {
      evaluations: Array<{
        item_id: string;
        score?: number;
        is_correct: boolean;
        error_type: string | null;
        concepts: string[];
      }>;
      failed_concepts: string[];
    };
    try {
      evaluationData = JSON.parse(jsonText);
    } catch (error) {
      console.error("Error parsing evaluation JSON:", error);
      // Fallback: simple string matching evaluation
      const evaluations = itemsWithConcepts.map((item, idx) => {
        const userAnswer = answers[idx]?.answer || "";
        const isCorrect =
          userAnswer.toLowerCase().trim() ===
          item.correct_answer?.toLowerCase().trim();
        return {
          item_id: item.id,
          is_correct: isCorrect,
          error_type: isCorrect ? null : "Answer mismatch",
          concepts: item.concepts || [],
        };
      });

      // Extract failed concepts from fallback
      const failedItems = evaluations.filter((e) => !e.is_correct);
      const failedConcepts = [
        ...new Set(failedItems.flatMap((e) => e.concepts || [])),
      ];

      evaluationData = {
        evaluations,
        failed_concepts: failedConcepts,
      };
    }

    // Update assessment items with user answers and correctness
    const updatePromises = evaluationData.evaluations.map(
      (evaluation: any, evalIndex: number) => {
        // Find item by ID (UUID) or by item order if item_id is "Item X" format
        let item;
        if (evaluation.item_id && evaluation.item_id.startsWith("Item ")) {
          // Extract item number from "Item X" format
          const itemNumber = parseInt(evaluation.item_id.replace("Item ", ""));
          item = items.find(
            (i) =>
              i.item_order === itemNumber || items.indexOf(i) === itemNumber - 1
          );
        } else {
          // Try to find by UUID
          item = items.find((i) => i.id === evaluation.item_id);
        }

        // Fallback to index-based matching if still not found
        if (!item && evalIndex < items.length) {
          item = items[evalIndex];
        }

        if (!item) {
          console.warn(
            `Item not found for evaluation: ${evaluation.item_id} at index ${evalIndex}`
          );
          return Promise.resolve();
        }

        const answerIndex = items.findIndex((i) => i.id === item.id);
        const userAnswer = answers[answerIndex]?.answer || "";

        // Use score if provided, otherwise use is_correct boolean
        const score =
          evaluation.score !== undefined
            ? evaluation.score
            : evaluation.is_correct
            ? 1.0
            : 0.0;
        const isCorrect = score >= 0.5;

        return supabase
          .from("assessment_items")
          .update({
            user_answer: userAnswer,
            is_correct: isCorrect,
            error_type: evaluation.error_type || null,
          })
          .eq("id", item.id);
      }
    );

    await Promise.all(updatePromises);

    // Calculate scores with partial credit
    const totalScore = evaluationData.evaluations.reduce(
      (sum: number, e: any) => {
        const itemScore =
          e.score !== undefined ? e.score : e.is_correct ? 1.0 : 0.0;
        return sum + itemScore;
      },
      0
    );
    const totalItems = items.length;
    const score = (totalScore / totalItems) * 100;
    const correctCount = evaluationData.evaluations.filter((e: any) => {
      const itemScore =
        e.score !== undefined ? e.score : e.is_correct ? 1.0 : 0.0;
      return itemScore >= 0.5;
    }).length;
    const allPassed = score >= 80; // Pass if score is 80% or higher (allows for partial credit)

    // Update assessment
    const { error: updateError } = await supabase
      .from("assessments")
      .update({
        status: allPassed ? "completed" : "failed",
        overall_score: score,
        completed_at: allPassed ? new Date().toISOString() : null,
        metadata: {
          ...(assessment.metadata || {}),
          failed_concepts: evaluationData.failed_concepts || [],
          evaluation_data: evaluationData,
        },
      })
      .eq("id", assessmentId);

    if (updateError) {
      console.error("Error updating assessment status:", updateError);
      throw new Error(
        `Failed to update assessment status: ${updateError.message}`
      );
    }

    // Update course metadata: clear in-progress, store completed assessment ID
    if (courseId) {
      const { data: courseData, error: courseFetchError } = await supabase
        .from("courses")
        .select("metadata")
        .eq("id", courseId)
        .single();

      if (courseFetchError) {
        console.error("Error fetching course metadata:", courseFetchError);
      } else {
        const currentMetadata = courseData?.metadata || {};
        const {
          in_progress_assessment_id,
          in_progress_assessment_topic,
          ...cleanedMetadata
        } = currentMetadata;

        // Store completed assessment ID for later reopening
        const updatedMetadata = {
          ...cleanedMetadata,
          completed_assessment_id: assessmentId,
        };

        // Only update if there was an in_progress_assessment_id to clear
        if (in_progress_assessment_id === assessmentId) {
          const { error: courseUpdateError } = await supabase
            .from("courses")
            .update({
              metadata: updatedMetadata,
            })
            .eq("id", courseId);

          if (courseUpdateError) {
            console.error("Error updating course metadata:", courseUpdateError);
          }
        } else {
          // Still update to store completed_assessment_id even if no in-progress was cleared
          const { error: courseUpdateError } = await supabase
            .from("courses")
            .update({
              metadata: updatedMetadata,
            })
            .eq("id", courseId);

          if (courseUpdateError) {
            console.error("Error updating course metadata:", courseUpdateError);
          }
        }
      }
    }

    // Update course indices if all passed
    if (allPassed && courseId) {
      const { data: course } = await supabase
        .from("courses")
        .select("current_lesson_index, current_topic_index, curriculum")
        .eq("id", courseId)
        .single();

      if (course) {
        const lessons = course.curriculum?.lessons || [];
        const currentLesson = lessons[course.current_lesson_index || 0];
        const topics = currentLesson?.topics || [];
        const isLastTopic =
          (course.current_topic_index || 0) >= topics.length - 1;

        if (isLastTopic) {
          // Move to next lesson
          await supabase
            .from("courses")
            .update({
              current_lesson_index: (course.current_lesson_index || 0) + 1,
              current_topic_index: 0,
            })
            .eq("id", courseId);
        } else {
          // Move to next topic
          await supabase
            .from("courses")
            .update({
              current_topic_index: (course.current_topic_index || 0) + 1,
            })
            .eq("id", courseId);
        }
      }
    }

    return NextResponse.json({
      success: true,
      allPassed,
      score,
      correctCount,
      totalItems,
      failedConcepts: evaluationData.failed_concepts || [],
      assessmentId,
    });
  } catch (error: any) {
    console.error("Error submitting assessment:", error);
    return NextResponse.json(
      { error: error.message || "Failed to submit assessment" },
      { status: 500 }
    );
  }
}
