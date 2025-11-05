import { getVectorStore } from "@/lib/vectorstore";
import { Document } from "@langchain/core/documents";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";

export async function saveMemory(
  courseId: string,
  userMessage: string,
  aiResponse: string,
  userId?: string,
  isLongTerm: boolean = false,
  accessToken?: string
): Promise<boolean> {
  try {
    console.log(
      `Saving memory for course: ${courseId}, user: ${
        userId || "anonymous"
      }, longterm: ${isLongTerm}`
    );

    const vectorStore = await getVectorStore(accessToken);
    if (!vectorStore) {
      console.error("Vector store failed to initialize, memory not saved.");
      return false;
    }

    const document = new Document({
      pageContent: `USER: ${userMessage}\nAI: ${aiResponse}`,
      metadata: {
        userId: userId,
        courseId: courseId,
        timestamp: Date.now(),
        type: "chat",
        isLongterm: isLongTerm,
      },
    });

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const isUUID = uuidRegex.test(String(document.metadata.courseId));
    console.log(`  courseId is valid UUID format: ${isUUID}`);
    console.log("=====================================");

    if (vectorStore instanceof SupabaseVectorStore) {
      try {
        await vectorStore.addDocuments([document]);
        console.log("Memory saved successfully.");
        return true;
      } catch (error: unknown) {
        console.error("Error adding document to vector store:", error);
        console.error("Error details:", JSON.stringify(error, null, 2));
        console.error("Error message:", (error as Error).message);
        console.error("Error stack:", (error as Error).stack);
        console.error("Error type:", (error as object).constructor.name);
        console.error(
          "DATABASE ERROR DETECTED:\nMemory could not be saved for course:",
          courseId
        );

        try {
          console.log("FALLBACK: Trying direct insert for memory...");
          if (vectorStore && "from" in vectorStore) {
            const timestamp = Date.now();

            console.log("===== DIRECT SUPABASE INSERT DATA =====");
            console.log(`  content: ${userMessage}\nAI: ${aiResponse}`);
            console.log(`  metadata will contain all other fields`);
            console.log("========================================");

            const { data, error } = await (vectorStore as any)
              .from("ai_memories")
              .insert([
                {
                  content: `USER: ${userMessage}\nAI: ${aiResponse}`,
                  metadata: {
                    courseId: courseId,
                    userId: userId,
                    isLongterm: isLongTerm,
                    timestamp: timestamp,
                    type: "chat",
                    created_at: new Date(timestamp).toISOString(),
                  },
                },
              ]);

            if (error) {
              console.error("Error saving memory:", error);
              return false;
            }
            console.log("Memory save successful:", data);
            return true;
          }
        } catch (e) {
          console.error("Error during memory save:", e);
          return false;
        }
      }
    } else if (vectorStore && "from" in vectorStore) {
      console.log(
        "⚠️ FALLBACK: Using direct Supabase queries for saving memory (no embeddings)"
      );
      try {
        const timestamp = Date.now();

        console.log("===== DIRECT SUPABASE INSERT DATA =====");
        console.log(`  content: ${userMessage}\nAI: ${aiResponse}`);
        console.log(`  metadata will contain all other fields`);
        console.log("========================================");

        const { data, error } = await vectorStore.from("ai_memories").insert([
          {
            content: `USER: ${userMessage}\nAI: ${aiResponse}`,
            metadata: {
              courseId: courseId,
              userId: userId,
              isLongterm: isLongTerm,
              timestamp: timestamp,
              type: "chat",
              created_at: new Date(timestamp).toISOString(),
            },
          },
        ]);

        if (error) {
          console.error("Error saving memory:", error);
          return false;
        }
        console.log("Memory save successful:", data);
        return true;
      } catch (e) {
        console.error("Error during memory save:", e);
        return false;
      }
    }

    return false;
  } catch (error) {
    console.error("Error saving memory:", error);

    if (error instanceof Error) {
      console.error("Error type:", error.constructor.name);
      console.error("Error message:", error.message);

      if (error.message.includes("Error inserting")) {
        console.error("DATABASE ERROR DETECTED:");

        const typeMatch = error.message.match(
          /COALESCE types (\w+) and (\w+) cannot be matched/
        );
        if (typeMatch) {
          console.error(
            `Type mismatch between ${typeMatch[1]} and ${typeMatch[2]}`
          );
          console.error(
            `This suggests your database schema has incompatible types between related columns.`
          );
          console.error(
            `Check that course_id in ai_memories matches the type of id in courses table.`
          );
        }
      }
    }

    return false;
  }
}

async function findSimilarMemory(
  userId: string,
  userMessage: string,
  aiResponse: string
): Promise<string | null> {
  try {
    const vectorStore = await getVectorStore();
    if (!vectorStore || !("from" in vectorStore)) {
      return null;
    }

    const content = `USER: ${userMessage}\nAI: ${aiResponse}`;

    if (vectorStore instanceof SupabaseVectorStore) {
      try {
        const results = await vectorStore.similaritySearch(content, 3, {
          userId: userId,
        });

        if (results && results.length > 0) {
          const similarDoc = results[0];
          const { data, error } = await (vectorStore as any).client
            .from("ai_memories")
            .select("id, content")
            .eq("user_id", userId)
            .ilike(
              "content",
              `%${similarDoc.pageContent.substring(
                0,
                Math.min(50, similarDoc.pageContent.length)
              )}%`
            )
            .limit(1);

          if (!error && data && data.length > 0) {
            console.log(
              `Found similar memory via vector search: ${data[0].id}`
            );
            return data[0].id;
          }
        }
      } catch (err) {
        console.log(
          "Vector similarity search failed, falling back to text search",
          err
        );
      }
    }

    const { data: existingMemories, error: searchError } = await vectorStore
      .from("ai_memories")
      .select("id, content")
      .eq("user_id", userId)
      .ilike(
        "content",
        `%${userMessage.substring(0, Math.min(20, userMessage.length))}%`
      )
      .limit(5);

    if (searchError || !existingMemories || existingMemories.length === 0) {
      return null;
    }

    const similarMemory = existingMemories.find((mem) => {
      const normalizedContent = mem.content.replace(/\s+/g, "").toLowerCase();
      const normalizedSearch = content.replace(/\s+/g, "").toLowerCase();

      return (
        normalizedContent.includes(
          normalizedSearch.substring(
            0,
            Math.floor(normalizedSearch.length * 0.8)
          )
        ) ||
        normalizedSearch.includes(
          normalizedContent.substring(
            0,
            Math.floor(normalizedContent.length * 0.8)
          )
        )
      );
    });

    return similarMemory ? similarMemory.id : null;
  } catch (error) {
    console.error("Error finding similar memory:", error);
    return null;
  }
}

async function promoteExistingMemory(
  memoryId: string,
  userId: string
): Promise<boolean> {
  try {
    const vectorStore = await getVectorStore();
    if (!vectorStore) {
      console.error("Vector store is null - initialization failed");
      return false;
    }

    let client;
    if ("from" in vectorStore) {
      client = vectorStore;
      console.log("Using direct Supabase client");
    } else if ("client" in vectorStore) {
      client = (vectorStore as any).client;
      console.log("Using client from vectorStore.client");
    } else {
      console.error("Vector store has invalid structure - no client available");
      return false;
    }

    if (!client || typeof client.from !== "function") {
      console.error("Invalid Supabase client - missing 'from' method");
      return false;
    }

    const { data: memoryData, error: fetchError } = await client
      .from("ai_memories")
      .select("*")
      .eq("id", memoryId)
      .single();

    if (fetchError) {
      console.error("Error fetching memory to promote:", fetchError);
      return false;
    }

    if (!memoryData) {
      console.error(`Memory ID ${memoryId} not found in database`);
      return false;
    }

    const memoryUserId = memoryData.user_id || memoryData.metadata?.userId;
    if (memoryUserId !== userId) {
      console.error(
        `Cannot promote memory: User ID mismatch. Memory belongs to ${memoryUserId}, but request came from ${userId}`
      );
      return false;
    }

    if (
      memoryData.is_longterm === true &&
      memoryData.metadata?.isLongterm === true
    ) {
      console.log(
        `Memory ${memoryId} is already marked as long-term in both fields`
      );
      return true;
    }

    const updatedMetadata = {
      ...memoryData.metadata,
      isLongterm: true,
    };

    const { error: updateError } = await client
      .from("ai_memories")
      .update({
        is_longterm: true,
        metadata: updatedMetadata,
      })
      .eq("id", memoryId);

    if (updateError) {
      console.error("Error promoting memory to long-term:", updateError);
      return false;
    }

    console.log(`Successfully promoted memory ${memoryId} to long-term`);
    return true;
  } catch (error) {
    console.error("Error promoting memory:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
    }
    return false;
  }
}

export async function saveToLongTermMemory(
  userId: string,
  options: {
    memoryId?: string;
    userMessage?: string;
    aiResponse?: string;
  }
): Promise<boolean> {
  try {
    console.log(`Saving to long-term memory for user: ${userId}`, options);

    if (options.memoryId) {
      return await promoteExistingMemory(options.memoryId, userId);
    }

    if (options.userMessage && options.aiResponse) {
      const similarMemoryId = await findSimilarMemory(
        userId,
        options.userMessage,
        options.aiResponse
      );

      if (similarMemoryId) {
        return await promoteExistingMemory(similarMemoryId, userId);
      }

      return await saveMemory(
        `long-term-${userId}`,
        options.userMessage,
        options.aiResponse,
        userId,
        true
      );
    }

    console.error("saveToLongTermMemory called with invalid options");
    return false;
  } catch (error) {
    console.error("Error in saveToLongTermMemory:", error);
    return false;
  }
}

