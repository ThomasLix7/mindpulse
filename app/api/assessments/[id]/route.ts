import { NextResponse } from "next/server";
import { createServerClient } from "@/utils/supabase-server";

export async function GET(
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

    // Get assessment
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

    // Get assessment items
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

    // Parse concepts from evaluation_data in metadata or error_type field
    const evaluationData = assessment.metadata?.evaluation_data;
    const itemsWithConcepts = items?.map((item, index) => {
      let concepts: string[] = [];
      
      // First try to get concepts from evaluation_data
      // Match by item_id (could be UUID or "Item X" format) or by index
      if (evaluationData?.evaluations) {
        const evaluation = evaluationData.evaluations.find(
          (e: any) => 
            e.item_id === item.id || 
            e.item_id === `Item ${index + 1}` ||
            e.item_id === `Item ${item.item_order}`
        );
        if (evaluation?.concepts && Array.isArray(evaluation.concepts)) {
          concepts = evaluation.concepts;
        }
      }
      
      // Fallback to assessment metadata concepts if no concepts found
      if (concepts.length === 0 && assessment.metadata?.concepts) {
        const assessmentConcepts = assessment.metadata.concepts;
        if (Array.isArray(assessmentConcepts)) {
          concepts = assessmentConcepts;
        }
      }
      
      return {
        ...item,
        concepts,
      };
    });

    return NextResponse.json({
      assessment,
      items: itemsWithConcepts || [],
    });
  } catch (error: any) {
    console.error("Error fetching assessment:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch assessment" },
      { status: 500 }
    );
  }
}
