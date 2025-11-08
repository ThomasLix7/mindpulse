import { NextResponse } from "next/server";
import { createServerClient } from "@/utils/supabase-server";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const itemId = id;

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

    const body = await req.json();
    const { user_answer } = body;

    if (user_answer === undefined) {
      return NextResponse.json(
        { error: "user_answer is required" },
        { status: 400 }
      );
    }

    // Get the assessment item to verify ownership
    const { data: item, error: itemError } = await supabase
      .from("assessment_items")
      .select("assessment_id")
      .eq("id", itemId)
      .single();

    if (itemError || !item) {
      return NextResponse.json(
        { error: "Assessment item not found" },
        { status: 404 }
      );
    }

    // Verify the user owns the assessment
    const { data: assessment, error: assessmentError } = await supabase
      .from("assessments")
      .select("user_id")
      .eq("id", item.assessment_id)
      .single();

    if (assessmentError || !assessment || assessment.user_id !== user.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    // Update the user_answer
    const { error: updateError } = await supabase
      .from("assessment_items")
      .update({ user_answer })
      .eq("id", itemId);

    if (updateError) {
      console.error("Error updating assessment item:", updateError);
      return NextResponse.json(
        { error: "Failed to update assessment item" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error updating assessment item:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update assessment item" },
      { status: 500 }
    );
  }
}

