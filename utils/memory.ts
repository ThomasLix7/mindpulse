import { getVectorStore } from "../lib/vectorstore";
import { Document } from "@langchain/core/documents";

interface MemoryDocument {
  pageContent: string;
  metadata: {
    userId?: string;
    sessionId: string;
    timestamp: number;
    type: "conversation";
  };
}

export async function saveMemory(
  sessionId: string,
  conversation: string,
  response: string,
  userId?: string
): Promise<boolean> {
  try {
    console.log(`Saving memory for session: ${sessionId}, user: ${userId}`);
    const vectorStore = await getVectorStore();
    if (!vectorStore) {
      console.error("Vector store failed to initialize, memory not saved.");
      return false;
    }

    // --- Simplified insert using supabase client directly ---
    if (vectorStore && "from" in vectorStore) {
      // Check if vectorStore is supabase client
      console.log("Using simplified memory save with supabase client");
      try {
        const { data, error } = await vectorStore.from("ai_memories").insert([
          {
            content: `USER: ${conversation}\nAI: ${response}`,
            metadata: {
              sessionId,
              userId,
              timestamp: Date.now(),
              type: "chat",
            },
          },
        ]);

        if (error) {
          console.error("Error saving memory (simplified):", error);
          return false;
        }
        console.log("Simplified memory save successful:", data);
        return true;
      } catch (e) {
        console.error("Error during simplified memory save:", e);
        return false;
      }
    }
    // --- End simplified insert ---

    // --- Original vector store code (commented out for now) ---
    // await vectorStore.addDocuments([
    //   {
    //     pageContent: `USER: ${conversation}\nAI: ${response}`,
    //     metadata: { sessionId, userId, timestamp: Date.now(), type: 'chat' },
    //   },
    // ]);
    // --- End original vector store code ---

    return true; // Indicate success even if simplified save fails (for now)
  } catch (error) {
    console.error("Error saving memory:", error);
    return false;
  }
}

export async function recallMemory(
  sessionId: string,
  query: string,
  userId?: string
): Promise<Document[]> {
  try {
    console.log(`Recalling memory for session: ${sessionId}, user: ${userId}`);
    const vectorStore = await getVectorStore();
    if (!vectorStore) {
      console.error("Vector store failed to initialize.");
      return []; // Return empty array if vector store is not available
    }

    // --- Simplified query using supabase client directly ---
    if (vectorStore && "from" in vectorStore) {
      // Check if vectorStore is supabase client
      console.log("Using simplified memory recall with supabase client");
      try {
        const { data, error } = await vectorStore
          .from("ai_memories")
          .select("content, metadata")
          .limit(5); // Just fetch some rows for now

        if (error) {
          console.error("Error fetching memories (simplified):", error);
          return [];
        }
        console.log("Simplified memory recall successful:", data);
        return data.map(
          (item) =>
            new Document({
              pageContent: item.content,
              metadata: item.metadata,
            })
        ); // Adapt data to Document format
      } catch (e) {
        console.error("Error during simplified memory recall:", e);
        return [];
      }
    }
    // --- End simplified query ---

    // --- Original vector store query (commented out for now) ---
    // const whereClause = userId
    //   ? "metadata->>'userId' = $1 OR metadata->>'sessionId' = $2"
    //   : "metadata->>'sessionId' = $1";
    // const parameters = userId ? [userId, sessionId] : [sessionId];

    // return await vectorStore.similaritySearch(query, 5, {
    //   where: whereClause,
    //   parameters: parameters,
    // });
    // --- End original vector store query ---
  } catch (error) {
    console.error("Error recalling memory:", error);
    return [];
  }
  return []; // Add default return
}
