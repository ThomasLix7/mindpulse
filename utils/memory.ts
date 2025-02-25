import { getVectorStore } from "../lib/vectorstore";

interface MemoryDocument {
  pageContent: string;
  metadata: {
    sessionId: string;
    timestamp: number;
    type: "conversation";
  };
}

export async function saveMemory(
  sessionId: string,
  conversation: string,
  response: string
) {
  try {
    const vectorStore = await getVectorStore();
    await vectorStore.addDocuments([
      {
        pageContent: `USER: ${conversation}\nAI: ${response}`,
        metadata: {
          sessionId,
          timestamp: Date.now(),
          type: "conversation",
        },
      } as MemoryDocument,
    ]);
    return true;
  } catch (error) {
    console.error("Error saving memory:", error);
    return false; // Return false to indicate failure
  }
}

export async function recallMemory(sessionId: string, query: string) {
  try {
    const vectorStore = await getVectorStore();
    return await vectorStore.similaritySearch(query, 5, {
      where: "metadata->>'sessionId' = $1",
      parameters: [sessionId],
    });
  } catch (error) {
    console.error("Error recalling memory:", error);
    return []; // Return empty array to avoid breaking the application
  }
}
