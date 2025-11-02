import { getVectorStore } from "@/lib/vectorstore";
import { model } from "@/lib/gemini";

// Generate course summary from recent course messages
async function generateCourseSummary(
  courseId: string,
  userId: string,
  accessToken?: string
): Promise<string | null> {
  try {
    const vectorStore = await getVectorStore(accessToken);
    if (!vectorStore || !("from" in vectorStore)) {
      return null;
    }

    // Get previous summary (most recent)
    let previousSummary: string | null = null;
    const { data: existingSummary } = await vectorStore
      .from("ai_memories")
      .select("content, created_at")
      .eq("course_id", courseId)
      .eq("user_id", userId)
      .eq("is_longterm", false)
      .filter("metadata->>'type'", "eq", "course_summary")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (existingSummary?.content) {
      previousSummary = existingSummary.content;
    }

    // Get last 30 messages for summarization
    const { data: recentMessages, error: msgError } = await vectorStore
      .from("course_messages")
      .select("role, content, created_at")
      .eq("course_id", courseId)
      .order("created_at", { ascending: false })
      .limit(30);

    if (msgError || !recentMessages || recentMessages.length === 0) {
      return null;
    }

    const conversationText = recentMessages
      .reverse()
      .map((msg: any) => `${msg.role}: ${msg.content}`)
      .join("\n");

    let prompt = `You are analyzing a learning conversation between a student and AI tutor. 
Create an UPDATED, comprehensive course progress summary that captures:

1. Topics/subjects covered (consolidate and update the list)
2. Student's current skill level and progress (reflect most recent assessment)
3. What concepts are mastered vs what needs work (update based on recent performance)
4. Current learning focus/goals (what's being worked on now)
5. Any patterns in struggles or strengths (identify trends)

Recent conversation (last 30 messages):
${conversationText.substring(0, 4000)}`;

    if (previousSummary) {
      prompt += `\n\nPrevious summary (for context - synthesize this with new information, don't just repeat):
${previousSummary}

IMPORTANT: Create a NEW summary that:
- Incorporates relevant information from the previous summary that's still accurate
- Adds/updates information from the recent conversation
- Removes or corrects outdated information from the previous summary
- Synthesizes everything into a coherent, up-to-date summary (not just concatenation)
- Maintains historical context where relevant but prioritizes current state`;
    }

    prompt += `\n\nProvide the updated summary in this format:
Topics Covered: [updated consolidated list]
Current Level: [updated description]
Progress: [updated - what's mastered]
Challenges: [updated - what needs work]
Current Focus: [what we're working on now]`;

    const chatSession = model.startChat();
    const result = await chatSession.sendMessage(prompt);
    const summary = result.response.text();

    return summary;
  } catch (error) {
    console.error("Error generating course summary:", error);
    return null;
  }
}

// Save/update course summary in short-term memory
export async function saveCourseSummary(
  courseId: string,
  userId: string,
  accessToken?: string
): Promise<boolean> {
  try {
    const summary = await generateCourseSummary(courseId, userId, accessToken);

    if (!summary) {
      return false;
    }

    const vectorStore = await getVectorStore(accessToken);
    if (!vectorStore || !("from" in vectorStore)) {
      return false;
    }

    // Always insert new summary to preserve history
    const summaryData = {
      content: summary,
      metadata: {
        courseId: courseId,
        userId: userId,
        isLongterm: false,
        type: "course_summary",
        timestamp: Date.now(),
        created_at: new Date().toISOString(),
      },
      is_longterm: false,
      course_id: courseId,
      user_id: userId,
    };

    const { error } = await vectorStore
      .from("ai_memories")
      .insert([summaryData]);

    if (error) {
      console.error("Error saving course summary:", error);
      return false;
    }
    console.log("Saved new course summary for course:", courseId);

    return true;
  } catch (error) {
    console.error("Error in saveCourseSummary:", error);
    return false;
  }
}
