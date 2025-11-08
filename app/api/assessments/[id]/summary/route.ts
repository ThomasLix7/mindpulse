import { NextResponse } from "next/server";
import { createServerClient } from "@/utils/supabase-server";
import { model } from "@/lib/gemini";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const assessmentId = id;

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

    if (authError || !user) {
      return NextResponse.json(
        { error: "Invalid access token" },
        { status: 401 }
      );
    }

    const { data: assessment, error: assessmentError } = await supabase
      .from("assessments")
      .select("*")
      .eq("id", assessmentId)
      .eq("user_id", user.id)
      .single();

    if (assessmentError || !assessment) {
      return NextResponse.json(
        { error: "Assessment not found" },
        { status: 404 }
      );
    }

    if (assessment.metadata?.summary) {
      return NextResponse.json({
        summary: assessment.metadata.summary,
        cached: true,
      });
    }

    const { data: items, error: itemsError } = await supabase
      .from("assessment_items")
      .select("*")
      .eq("assessment_id", assessmentId)
      .order("item_order", { ascending: true });

    if (itemsError) {
      return NextResponse.json(
        { error: "Failed to fetch assessment items" },
        { status: 500 }
      );
    }

    const passedItems = items.filter((item: any) => item.is_correct);
    const failedItems = items.filter((item: any) => !item.is_correct);
    const failedConcepts = assessment.metadata?.failed_concepts || [];

    const summaryPrompt = `You are an expert educational assessor. The user has just completed an assessment.

ASSESSMENT RESULTS:
- Total items: ${items.length}
- Passed: ${passedItems.length}
- Failed: ${failedItems.length}
- Score: ${assessment.overall_score}%
- Status: ${assessment.status}

${failedItems.length > 0 ? `FAILED ITEMS:
${failedItems
  .map(
    (item: any, idx: number) =>
      `Item ${idx + 1}: ${item.question_text}
  Correct Answer: ${item.correct_answer}
  User Answer: ${item.user_answer || "No answer"}
  Error: ${item.error_type || "Incorrect"}
  Concepts: ${(item.concepts || []).join(", ") || "Unknown"}`
  )
  .join("\n\n")}

FAILED CONCEPTS THAT NEED REVISION: ${failedConcepts.join(", ")}` : ""}

Provide a diagnostic summary that includes:
1. A brief acknowledgment of completion
2. Overall results breakdown (total questions, passed, failed, score, status)
3. What the user demonstrated understanding of (strengths)
4. Areas that need revision (weaknesses/concepts to focus on)
5. A brief explanation of what went wrong in failed items

DO NOT include:
- Practice questions or exercises
- "Your Turn" sections
- Step-by-step revision content
- Detailed explanations of concepts

Be encouraging but clear about what needs improvement. Use "You" or "Your" to refer to the student.`;

    const result = await model.generateContent(summaryPrompt);
    const summary = result.response.text();

    const currentMetadata = assessment.metadata || {};
    const { error: updateError } = await supabase
      .from("assessments")
      .update({
        metadata: {
          ...currentMetadata,
          summary: summary,
        },
      })
      .eq("id", assessmentId);

    if (updateError) {
      console.error("Error saving summary:", updateError);
    }

    return NextResponse.json({
      summary: summary,
      cached: false,
    });
  } catch (error: any) {
    console.error("Error generating summary:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate summary" },
      { status: 500 }
    );
  }
}

