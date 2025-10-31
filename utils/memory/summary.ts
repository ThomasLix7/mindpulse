import { getVectorStore } from "@/lib/vectorstore";
import { model } from "@/lib/gemini";

// Generate learning path summary from recent conversation messages
async function generateLearningPathSummary(
  conversationId: string,
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
      .from("conversation_messages")
      .select("role, content, created_at")
      .eq("conversation_id", conversationId)
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
Create a concise learning path summary that captures:

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
    console.error("Error generating learning path summary:", error);
    return null;
  }
}

// Save/update learning path summary in short-term memory
export async function saveLearningPathSummary(
  conversationId: string,
  userId: string,
  accessToken?: string
): Promise<boolean> {
  try {
    const summary = await generateLearningPathSummary(
      conversationId,
      userId,
      accessToken
    );

    if (!summary) {
      return false;
    }

    const vectorStore = await getVectorStore(accessToken);
    if (!vectorStore || !("from" in vectorStore)) {
      return false;
    }

    // Check if summary already exists for this conversation
    const { data: existing } = await vectorStore
      .from("ai_memories")
      .select("id")
      .eq("conversation_id", conversationId)
      .eq("user_id", userId)
      .eq("is_longterm", false)
      .filter("metadata->>'type'", "eq", "learning_path_summary")
      .limit(1)
      .single();

    const summaryData = {
      content: summary,
      metadata: {
        conversationId: conversationId,
        userId: userId,
        isLongterm: false,
        type: "learning_path_summary",
        timestamp: Date.now(),
        created_at: new Date().toISOString(),
      },
      is_longterm: false,
      conversation_id: conversationId,
      user_id: userId,
    };

    if (existing) {
      const { error } = await vectorStore
        .from("ai_memories")
        .update(summaryData)
        .eq("id", existing.id);

      if (error) {
        console.error("Error updating learning path summary:", error);
        return false;
      }
      console.log(
        "Updated learning path summary for conversation:",
        conversationId
      );
    } else {
      const { error } = await vectorStore
        .from("ai_memories")
        .insert([summaryData]);

      if (error) {
        console.error("Error saving learning path summary:", error);
        return false;
      }
      console.log(
        "Saved learning path summary for conversation:",
        conversationId
      );
    }

    return true;
  } catch (error) {
    console.error("Error in saveLearningPathSummary:", error);
    return false;
  }
}

