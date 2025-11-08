import { NextResponse } from "next/server";
import { createServerClient } from "@/utils/supabase-server";

export async function PATCH(req: Request) {
  try {
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
    const { updates } = body;

    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json(
        { error: "Updates array is required" },
        { status: 400 }
      );
    }

    // Get all item IDs and verify ownership
    const itemIds = updates.map((u: any) => u.id).filter(Boolean);
    if (itemIds.length === 0) {
      return NextResponse.json(
        { error: "No valid item IDs provided" },
        { status: 400 }
      );
    }

    const { data: items, error: itemsError } = await supabase
      .from("assessment_items")
      .select("id, assessment_id")
      .in("id", itemIds);

    if (itemsError || !items || items.length === 0) {
      return NextResponse.json(
        { error: "Assessment items not found" },
        { status: 404 }
      );
    }

    // Get unique assessment IDs
    const assessmentIds = [...new Set(items.map((i) => i.assessment_id))];

    // Verify user owns all assessments
    const { data: assessments, error: assessmentError } = await supabase
      .from("assessments")
      .select("id, user_id")
      .in("id", assessmentIds);

    if (assessmentError || !assessments) {
      return NextResponse.json(
        { error: "Failed to verify assessment ownership" },
        { status: 500 }
      );
    }

    const unauthorizedAssessments = assessments.filter(
      (a) => a.user_id !== user.id
    );
    if (unauthorizedAssessments.length > 0) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Perform batch updates using individual updates in parallel
    // Supabase doesn't support batch updates with different values per row,
    // but we can optimize by grouping updates
    const updatePromises = updates.map((update: any) => {
      const updateData: any = {};
      if (update.user_answer !== undefined) {
        updateData.user_answer = update.user_answer;
      }
      if (update.is_correct !== undefined) {
        updateData.is_correct = update.is_correct;
      }
      if (update.error_type !== undefined) {
        updateData.error_type = update.error_type;
      }

      if (Object.keys(updateData).length === 0) {
        return Promise.resolve();
      }

      return supabase
        .from("assessment_items")
        .update(updateData)
        .eq("id", update.id);
    });

    const results = await Promise.all(updatePromises);

    // Check for errors
    const errors = results.filter((r) => {
      return (
        r !== undefined &&
        r !== null &&
        typeof r === "object" &&
        "error" in r &&
        r.error !== null
      );
    });
    if (errors.length > 0) {
      console.error("Some updates failed:", errors);
      return NextResponse.json(
        { error: "Some updates failed", details: errors },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      updated: updates.length,
    });
  } catch (error: any) {
    console.error("Error batch updating assessment items:", error);
    return NextResponse.json(
      { error: error.message || "Failed to batch update assessment items" },
      { status: 500 }
    );
  }
}
