import { getVectorStore } from "../lib/vectorstore";
import { Document } from "@langchain/core/documents";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { createClient } from "@supabase/supabase-js";

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

    // Create a document with the conversation content
    const document = new Document({
      pageContent: `USER: ${conversation}\nAI: ${response}`,
      metadata: {
        sessionId,
        userId,
        timestamp: Date.now(),
        type: "chat",
      },
    });

    // Check if we got a vectorstore or just a Supabase client
    if (vectorStore instanceof SupabaseVectorStore) {
      // Use the proper vector store interface
      console.log("Using vector store for memory save");
      await vectorStore.addDocuments([document]);
      return true;
    } else if (vectorStore && "from" in vectorStore) {
      // Fallback to using Supabase client directly
      console.log(
        "⚠️ FALLBACK: Using direct Supabase queries for saving memory (no embeddings)"
      );
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

    return false;
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
      return [];
    }

    // Check if we got a vectorstore or just a Supabase client
    if (vectorStore instanceof SupabaseVectorStore) {
      // Use the proper vector store interface for similarity search
      console.log("Using vector store for memory recall");

      // Create metadata filter
      const filter = userId
        ? {
            or: [{ sessionId: sessionId }, { userId: userId }],
          }
        : { sessionId: sessionId };

      // Perform the similarity search
      return await vectorStore.similaritySearch(query, 5, filter);
    } else if (vectorStore && "from" in vectorStore) {
      // Fallback to using Supabase client directly
      console.log(
        "⚠️ FALLBACK: Using direct Supabase queries for recalling memory (no embeddings)"
      );
      try {
        // Start with session-based memories
        const { data: sessionData, error: sessionError } = await vectorStore
          .from("ai_memories")
          .select("content, metadata")
          .filter("metadata->>'sessionId'", "eq", sessionId)
          .order("metadata->>'timestamp'", { ascending: false })
          .limit(5);

        if (sessionError) {
          console.error("Error fetching session memories:", sessionError);
          return [];
        }

        let results = sessionData || [];

        // If userId is provided, also fetch user memories
        if (userId) {
          const { data: userData, error: userError } = await vectorStore
            .from("ai_memories")
            .select("content, metadata")
            .filter("metadata->>'userId'", "eq", userId)
            .order("metadata->>'timestamp'", { ascending: false })
            .limit(5);

          if (!userError && userData) {
            // Combine results, prioritizing user-specific memories
            results = [...userData, ...results];
          }
        }

        // Convert to Document format
        return results.map(
          (item) =>
            new Document({
              pageContent: item.content,
              metadata: item.metadata,
            })
        );
      } catch (e) {
        console.error("Error during simplified memory recall:", e);
        return [];
      }
    }

    return [];
  } catch (error) {
    console.error("Error recalling memory:", error);
    return [];
  }
}
