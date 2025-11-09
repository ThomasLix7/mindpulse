import { getVectorStore } from "@/lib/vectorstore";
import { model } from "@/lib/gemini";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";

interface CourseSummaryResult {
  summary: string | null;
  insights: Array<{ type: string; content: string }>;
}

async function generateCourseSummaryAndInsights(
  courseId: string,
  userId: string,
  accessToken?: string
): Promise<CourseSummaryResult> {
  try {
    const vectorStore = await getVectorStore(accessToken);
    if (!vectorStore) {
      return { summary: null, insights: [] };
    }

    const isVectorStore = vectorStore instanceof SupabaseVectorStore;
    const client = isVectorStore ? (vectorStore as any).client : vectorStore;

    if (!client || typeof client.from !== "function") {
      return { summary: null, insights: [] };
    }

    let previousSummary: string | null = null;
    const { data: existingSummary } = await client
      .from("ai_memories")
      .select("content, created_at")
      .eq("course_id", courseId)
      .eq("user_id", userId)
      .eq("is_longterm", false)
      .eq("memory_type", "course_summary")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (existingSummary?.content) {
      previousSummary = existingSummary.content;
    }

    const { data: recentMessages, error: msgError } = await client
      .from("course_messages")
      .select("role, content, created_at")
      .eq("course_id", courseId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (msgError) {
      console.error("Error fetching messages:", msgError);
      return { summary: null, insights: [] };
    }

    if (!recentMessages || recentMessages.length === 0) {
      return { summary: null, insights: [] };
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

Recent conversation (last 50 messages):
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

    prompt += `\n\nProvide your response in this exact format:
CourseSummary: [updated summary in this format:
Topics Covered: [updated consolidated list]
Current Level: [updated description]
Progress: [updated - what's mastered]
Challenges: [updated - what needs work]
Current Focus: [what we're working on now]]

LearningInsights: [JSON array of valuable cross-platform user insights, or empty array [] if nothing valuable found. Each insight should be one focused fact. Format:
[
  {
    "type": "learning_style" | "preference" | "strength" | "communication_style",
    "content": "one focused fact about the user"
  }
]
Only include insights that are valuable across the platform, not course-specific. If no valuable insights, return [].]`;

    const chatSession = model.startChat();
    const result = await chatSession.sendMessage(prompt);
    const responseText = result.response.text();

    // Parse response
    const summaryMatch = responseText.match(
      /CourseSummary:\s*([\s\S]+?)(?=LearningInsights:|$)/
    );
    const insightsMatch = responseText.match(
      /LearningInsights:\s*(\[[\s\S]*\])/
    );

    let summary: string | null = null;
    let insights: Array<{ type: string; content: string }> = [];

    if (summaryMatch) {
      summary = summaryMatch[1].trim();
    }

    if (insightsMatch) {
      try {
        const insightsText = insightsMatch[1].trim();
        insights = JSON.parse(insightsText);
        if (!Array.isArray(insights)) {
          insights = [];
        }
      } catch (e) {
        console.error("Error parsing LearningInsights JSON:", e);
        insights = [];
      }
    }

    return { summary, insights };
  } catch (error) {
    console.error("Error generating course summary:", error);
    return { summary: null, insights: [] };
  }
}

async function processLearningInsights(
  insights: Array<{ type: string; content: string }>,
  userId: string,
  vectorStore: any,
  client: any
): Promise<void> {
  if (!insights || insights.length === 0) {
    return;
  }

  const isVectorStore = vectorStore instanceof SupabaseVectorStore;
  if (!isVectorStore) {
    return;
  }

  const embeddings = (vectorStore as any).embeddings;
  if (!embeddings) {
    return;
  }

  // Group insights by type
  const insightsByType = new Map<
    string,
    Array<{ type: string; content: string }>
  >();
  for (const insight of insights) {
    if (!insightsByType.has(insight.type)) {
      insightsByType.set(insight.type, []);
    }
    insightsByType.get(insight.type)!.push(insight);
  }

  // Process each type group
  for (const [type, typeInsights] of insightsByType) {
    // Fetch existing long-term memories of this type
    const { data: existingMemories } = await client
      .from("ai_memories")
      .select("id, content, vector")
      .eq("user_id", userId)
      .eq("is_longterm", true)
      .eq("memory_type", type);

    if (!existingMemories || existingMemories.length === 0) {
      // No existing memories, insert all insights of this type
      for (const insight of typeInsights) {
        try {
          const embedding = await embeddings.embedQuery(insight.content);
          await client.from("ai_memories").insert([
            {
              content: insight.content,
              vector: embedding,
              metadata: {},
              is_longterm: true,
              user_id: userId,
              course_id: null,
              memory_type: type,
            },
          ]);
        } catch (error) {
          console.error(`Error saving insight type ${type}:`, error);
        }
      }
      continue;
    }

    // Process each insight against existing memories
    for (const insight of typeInsights) {
      try {
        const insightEmbedding = await embeddings.embedQuery(insight.content);

        // Calculate similarity with existing memories
        let maxSimilarity = 0;
        let mostSimilarId: string | null = null;

        for (const memory of existingMemories) {
          if (!memory.vector || memory.vector.length === 0) continue;

          // Calculate cosine similarity
          const dotProduct = insightEmbedding.reduce(
            (sum: number, val: number, i: number) =>
              sum + val * memory.vector[i],
            0
          );
          const insightMagnitude = Math.sqrt(
            insightEmbedding.reduce(
              (sum: number, val: number) => sum + val * val,
              0
            )
          );
          const memoryMagnitude = Math.sqrt(
            memory.vector.reduce(
              (sum: number, val: number) => sum + val * val,
              0
            )
          );
          const similarity = dotProduct / (insightMagnitude * memoryMagnitude);

          if (similarity > maxSimilarity) {
            maxSimilarity = similarity;
            mostSimilarId = memory.id;
          }
        }

        // Apply merge strategy
        if (maxSimilarity > 0.8) {
          // Update: refine existing memory (replace)
          await client
            .from("ai_memories")
            .update({
              content: insight.content,
              vector: insightEmbedding,
            })
            .eq("id", mostSimilarId);
        } else {
          // Insert: new insight (similarity <= 0.8, keep both if similar exists)
          await client.from("ai_memories").insert([
            {
              content: insight.content,
              vector: insightEmbedding,
              metadata: {},
              is_longterm: true,
              user_id: userId,
              course_id: null,
              memory_type: type,
            },
          ]);
        }
      } catch (error) {
        console.error(`Error processing insight type ${type}:`, error);
      }
    }
  }
}

export async function saveCourseSummary(
  courseId: string,
  userId: string,
  accessToken?: string
): Promise<boolean> {
  try {
    const { summary, insights } = await generateCourseSummaryAndInsights(
      courseId,
      userId,
      accessToken
    );
    if (!summary) {
      return false;
    }

    const vectorStore = await getVectorStore(accessToken);
    if (!vectorStore) {
      return false;
    }

    const isVectorStore = vectorStore instanceof SupabaseVectorStore;
    const client = isVectorStore ? (vectorStore as any).client : vectorStore;

    if (!client || typeof client.from !== "function") {
      return false;
    }

    let embedding: number[] | null = null;
    if (isVectorStore) {
      try {
        const embeddings = (vectorStore as any).embeddings;
        if (embeddings) {
          embedding = await embeddings.embedQuery(summary);
        }
      } catch (embedError) {
        console.error("Error generating embedding:", embedError);
      }
    }

    const summaryData: any = {
      content: summary,
      metadata: {},
      is_longterm: false,
      course_id: courseId,
      user_id: userId,
      memory_type: "course_summary",
    };

    if (embedding && embedding.length > 0) {
      summaryData.vector = embedding;
    } else {
      summaryData.vector = new Array(1536).fill(0);
    }

    const { error } = await client.from("ai_memories").insert([summaryData]);

    if (error) {
      console.error("Error saving course summary:", error);
      return false;
    }

    // Process learning insights if any
    if (insights && insights.length > 0) {
      try {
        await processLearningInsights(insights, userId, vectorStore, client);
      } catch (insightError) {
        console.error("Error processing learning insights:", insightError);
        // Don't fail the whole operation if insights fail
      }
    }

    return true;
  } catch (error) {
    console.error("Error in saveCourseSummary:", error);
    return false;
  }
}
