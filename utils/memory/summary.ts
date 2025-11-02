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

    const prompt = `You are analyzing a learning conversation between a student and AI tutor. 
Create a concise course progress summary that captures:

1. Topics/subjects covered
2. Student's current skill level and progress
3. What concepts are mastered vs what needs work
4. Current learning focus/goals
5. Any patterns in struggles or strengths

Conversation excerpt:
${conversationText.substring(0, 4000)}

Provide a structured summary in this format:
Topics Covered: [list]
Current Level: [description]
Progress: [what's mastered]
Challenges: [what needs work]
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

    // Check if summary already exists for this course
    const { data: existing } = await vectorStore
      .from("ai_memories")
      .select("id")
      .eq("course_id", courseId)
      .eq("user_id", userId)
      .eq("is_longterm", false)
      .filter("metadata->>'type'", "eq", "course_summary")
      .limit(1)
      .single();

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

    if (existing) {
      const { error } = await vectorStore
        .from("ai_memories")
        .update(summaryData)
        .eq("id", existing.id);

      if (error) {
        console.error("Error updating course summary:", error);
        return false;
      }
      console.log("Updated course summary for course:", courseId);
    } else {
      const { error } = await vectorStore
        .from("ai_memories")
        .insert([summaryData]);

      if (error) {
        console.error("Error saving course summary:", error);
        return false;
      }
      console.log("Saved course summary for course:", courseId);
    }

    return true;
  } catch (error) {
    console.error("Error in saveCourseSummary:", error);
    return false;
  }
}
