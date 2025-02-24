import { vectorStore } from "../lib/vectorstore";

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
}

export async function recallMemory(sessionId: string, query: string) {
  return vectorStore.similaritySearch(query, 5, {
    where: "metadata->>'sessionId' = $1",
    parameters: [sessionId],
  });
}
