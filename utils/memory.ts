import { getVectorStore } from "../lib/vectorstore";
import { Document } from "@langchain/core/documents";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";

// The Document's metadata is only used internally by the vector store library for filtering
// This isn't stored in a "metadata" column in the database
export async function saveMemory(
  conversationId: string,
  userMessage: string,
  aiResponse: string,
  userId?: string,
  isLongTerm: boolean = false
): Promise<boolean> {
  try {
    console.log(
      `Saving memory for conversation: ${conversationId}, user: ${
        userId || "anonymous"
      }, longterm: ${isLongTerm}`
    );

    const vectorStore = await getVectorStore();
    if (!vectorStore) {
      console.error("Vector store failed to initialize, memory not saved.");
      return false;
    }

    // Create a document with fields that the vector store library needs for filtering
    const document = new Document({
      pageContent: `USER: ${userMessage}\nAI: ${aiResponse}`,
      metadata: {
        userId: userId,
        conversationId: conversationId,
        timestamp: Date.now(),
        type: "chat",
        isLongterm: isLongTerm,
      },
    });

    // Check if the conversationId is a valid UUID format
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const isUUID = uuidRegex.test(String(document.metadata.conversationId));
    console.log(`  conversationId is valid UUID format: ${isUUID}`);
    console.log("=====================================");

    // Check if we got a vectorstore or just a Supabase client
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
          "DATABASE ERROR DETECTED:\nMemory could not be saved for conversation:",
          conversationId
        );

        // Fallback to direct insert for the case where the vectorstore fails
        try {
          console.log("FALLBACK: Trying direct insert for memory...");
          if (vectorStore && "from" in vectorStore) {
            // After schema change: All fields need to be in metadata
            const timestamp = Date.now();

            // Log insert data for the direct Supabase method
            console.log("===== DIRECT SUPABASE INSERT DATA =====");
            console.log(`  content: ${userMessage}\nAI: ${aiResponse}`);
            console.log(`  metadata will contain all other fields`);
            console.log("========================================");

            // Store in database using the simplified schema
            const { data, error } = await (vectorStore as any)
              .from("ai_memories")
              .insert([
                {
                  content: `USER: ${userMessage}\nAI: ${aiResponse}`,
                  metadata: {
                    conversationId: conversationId,
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
      // Fallback to using Supabase client directly
      console.log(
        "⚠️ FALLBACK: Using direct Supabase queries for saving memory (no embeddings)"
      );
      try {
        // After schema change: All fields need to be in metadata
        const timestamp = Date.now();

        // Log insert data for the direct Supabase method
        console.log("===== DIRECT SUPABASE INSERT DATA =====");
        console.log(`  content: ${userMessage}\nAI: ${aiResponse}`);
        console.log(`  metadata will contain all other fields`);
        console.log("========================================");

        // Store in database using the simplified schema
        const { data, error } = await vectorStore.from("ai_memories").insert([
          {
            content: `USER: ${userMessage}\nAI: ${aiResponse}`,
            metadata: {
              conversationId: conversationId,
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

    // Enhanced error logging
    if (error instanceof Error) {
      console.error("Error type:", error.constructor.name);
      console.error("Error message:", error.message);

      // Extract database error details if available
      if (error.message.includes("Error inserting")) {
        console.error("DATABASE ERROR DETECTED:");

        // Parse out specific information like type mismatches
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
            `Check that conversation_id in ai_memories matches the type of id in conversations table.`
          );
        }
      }
    }

    return false;
  }
}

/**
 * Unified function to save something to long-term memory.
 * This is a smart function that can either:
 * 1. Create a new long-term memory
 * 2. Promote an existing memory to long-term
 * 3. Check for similar memories to avoid duplicates
 *
 * @param userId The user ID
 * @param options Configuration object with the following options:
 *    - memoryId: ID of an existing memory to promote to long-term
 *    - userMessage: User message content to create a new long-term memory
 *    - aiResponse: AI response content to create a new long-term memory
 * @returns Promise<boolean> indicating success
 *
 * @example
 * // To promote an existing memory:
 * await saveToLongTermMemory("user123", { memoryId: "memory456" });
 *
 * // To create a new long-term memory:
 * await saveToLongTermMemory("user123", {
 *   userMessage: "What is your name?",
 *   aiResponse: "My name is AI Assistant."
 * });
 */
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

    // Case 1: Promoting an existing memory
    if (options.memoryId) {
      return await promoteExistingMemory(options.memoryId, userId);
    }

    // Case 2: Creating a new memory
    if (options.userMessage && options.aiResponse) {
      // Check for similar memories first
      const similarMemoryId = await findSimilarMemory(
        userId,
        options.userMessage,
        options.aiResponse
      );

      if (similarMemoryId) {
        // Found similar memory, promote it instead
        return await promoteExistingMemory(similarMemoryId, userId);
      }

      // No similar memory found, create new one
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

/**
 * Helper function to find a similar memory
 */
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

    // Use vector search if available to find semantically similar memories
    if (vectorStore instanceof SupabaseVectorStore) {
      try {
        // Try to use vector search to find similar memories
        const results = await vectorStore.similaritySearch(content, 3, {
          userId: userId,
        });

        if (results && results.length > 0) {
          // Find the memory ID from the search results
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

    // Fall back to text-based search
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

    // Look for an exact or very similar match
    const similarMemory = existingMemories.find((mem) => {
      // Compare without whitespace and case sensitivity for better matching
      const normalizedContent = mem.content.replace(/\s+/g, "").toLowerCase();
      const normalizedSearch = content.replace(/\s+/g, "").toLowerCase();

      // Check if contents are very similar (80% match or better)
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

/**
 * Helper function to promote an existing memory to long-term
 */
async function promoteExistingMemory(
  memoryId: string,
  userId: string
): Promise<boolean> {
  try {
    console.log(`Promoting memory ${memoryId} to long-term for user ${userId}`);

    const vectorStore = await getVectorStore();
    if (!vectorStore) {
      console.error("Vector store is null - initialization failed");
      return false;
    }

    // Extract the Supabase client from the vector store
    // This handles multiple possible structures
    let client;
    if ("from" in vectorStore) {
      // Direct client case
      client = vectorStore;
      console.log("Using direct Supabase client");
    } else if ("client" in vectorStore) {
      // SupabaseVectorStore case
      client = (vectorStore as any).client;
      console.log("Using client from vectorStore.client");
    } else {
      console.error("Vector store has invalid structure - no client available");
      console.log("Vector store type:", typeof vectorStore);
      console.log("Vector store properties:", Object.keys(vectorStore));
      return false;
    }

    if (!client || typeof client.from !== "function") {
      console.error("Invalid Supabase client - missing 'from' method");
      return false;
    }

    // First verify the memory belongs to this user
    console.log(`Querying database for memory ID: ${memoryId}`);
    const { data: memoryData, error: fetchError } = await client
      .from("ai_memories")
      .select("*")
      .eq("id", memoryId)
      .single();

    if (fetchError) {
      console.error("Error fetching memory to promote:", fetchError);
      console.log("Memory ID that failed:", memoryId);
      return false;
    }

    if (!memoryData) {
      console.error(`Memory ID ${memoryId} not found in database`);
      return false;
    }

    console.log(`Memory data found:`, {
      id: memoryData.id,
      content: memoryData.content
        ? memoryData.content.substring(0, 50) + "..."
        : null,
      user_id: memoryData.user_id,
      metadata_userId: memoryData.metadata?.userId,
      is_longterm: memoryData.is_longterm,
      metadata_isLongterm: memoryData.metadata?.isLongterm,
    });

    // Check if memory belongs to the user
    const memoryUserId = memoryData.user_id || memoryData.metadata?.userId;
    if (memoryUserId !== userId) {
      console.error(
        `Cannot promote memory: User ID mismatch. Memory belongs to ${memoryUserId}, but request came from ${userId}`
      );
      return false;
    }

    // If it's already a long-term memory, no need to update
    if (
      memoryData.is_longterm === true ||
      memoryData.metadata?.isLongterm === true
    ) {
      console.log(`Memory ${memoryId} is already marked as long-term`);
      return true;
    }

    // Carefully merge the metadata to avoid overwriting existing fields
    const updatedMetadata = {
      ...memoryData.metadata,
      isLongterm: true,
    };

    console.log(
      `Updating memory ${memoryId} with is_longterm=true and updated metadata`
    );

    // Update the memory to set is_longterm = true
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

export async function recallMemory(
  conversationId: string,
  query: string,
  userId?: string
): Promise<Document[]> {
  try {
    console.log(
      `Recalling memory for conversation: ${conversationId}, user: ${
        userId || "anonymous"
      }`
    );

    const vectorStore = await getVectorStore();
    if (!vectorStore) {
      console.error("Vector store failed to initialize.");
      return [];
    }

    // Check if we got a vectorstore or just a Supabase client
    if (vectorStore instanceof SupabaseVectorStore) {
      // Create filter for vector store (uses metadata internally)
      // Note: When using json fields, we need to use filter in a special way
      if (userId) {
        // This approach uses direct SQL filtering instead of the built-in filter object
        try {
          const supabaseClient = (vectorStore as any).client;

          // First try to get conversation-specific memories using the new columns
          const { data: conversationData, error: convError } =
            await supabaseClient
              .from("ai_memories")
              .select("content, metadata, created_at")
              .eq("conversation_id", conversationId)
              .order("created_at", { ascending: false })
              .limit(5);

          if (convError) {
            console.error("Error fetching conversation memories:", convError);
            return [];
          }

          let allResults = conversationData || [];

          // Also get long-term memories for this user using the new columns
          const { data: longTermData, error: ltError } = await supabaseClient
            .from("ai_memories")
            .select("content, metadata, created_at")
            .eq("user_id", userId)
            .eq("is_longterm", true)
            .order("created_at", { ascending: false })
            .limit(5);

          if (!ltError && longTermData && longTermData.length > 0) {
            console.log(
              `Found ${longTermData.length} long-term memories for user ${userId}`
            );
            allResults = [...allResults, ...longTermData];
          }

          // Special handling for personal information queries
          if (
            query.toLowerCase().includes("name") ||
            query.toLowerCase().includes("who am i") ||
            query.toLowerCase().includes("about me")
          ) {
            // Try direct personal info search
            const { data: nameData, error: nameError } = await supabaseClient
              .from("ai_memories")
              .select("id, content, metadata, created_at")
              .eq("user_id", userId)
              .or(`is_longterm.eq.true,metadata->>'isLongterm'.eq.true`)
              .or(
                "content.ilike.%my name is%,content.ilike.%name%,content.ilike.%i am%,content.ilike.%call me%"
              )
              .order("created_at", { ascending: false })
              .limit(10);

            if (!nameError && nameData && nameData.length > 0) {
              console.log(`Found ${nameData.length} personal info memories`);

              // Prioritize personal information
              allResults = [
                ...nameData,
                ...allResults.filter(
                  (item: any) =>
                    !nameData.some(
                      (p: any) =>
                        p.content === item.content &&
                        p.created_at === item.created_at
                    )
                ),
              ];
            }
          }

          // Convert to Document format for consistent return type
          return allResults.map(
            (item: any) =>
              new Document({
                pageContent: item.content,
                metadata: {
                  ...item.metadata,
                  timestamp: item.created_at
                    ? new Date(item.created_at).getTime()
                    : Date.now(),
                },
              })
          );
        } catch (error) {
          console.error("Error during vectorstore query:", error);
          // Fall back to the fallback method
          console.log("Falling back to direct Supabase queries");
        }
      } else {
        // For anonymous users, just get conversation-specific memories
        try {
          const supabaseClient = (vectorStore as any).client;
          const { data, error } = await supabaseClient
            .from("ai_memories")
            .select("content, metadata, created_at")
            .eq("conversation_id", conversationId)
            .order("created_at", { ascending: false })
            .limit(5);

          if (error) {
            console.error(
              "Error fetching anonymous conversation memories:",
              error
            );
            return [];
          }

          return (data || []).map(
            (item: any) =>
              new Document({
                pageContent: item.content,
                metadata: {
                  ...item.metadata,
                  timestamp: item.created_at
                    ? new Date(item.created_at).getTime()
                    : Date.now(),
                },
              })
          );
        } catch (error) {
          console.error("Error during anonymous vectorstore query:", error);
          // Fall back to the fallback method
          console.log("Falling back to direct Supabase queries");
        }
      }
    }

    // Fallback or direct client case
    if (vectorStore && "from" in vectorStore) {
      // Fallback to using Supabase client directly
      console.log(
        "⚠️ FALLBACK: Using direct Supabase queries for memory recall (no embeddings)"
      );
      try {
        // Start with conversation-based memories using the new columns
        const { data: conversationData, error: convError } = await vectorStore
          .from("ai_memories")
          .select("content, metadata, created_at")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: false })
          .limit(5);

        if (convError) {
          console.error("Error fetching conversation memories:", convError);
          return [];
        }

        let results = conversationData || [];

        // If userId is provided, also fetch long-term memories using the new columns
        if (userId) {
          // Fetch long-term memories across all conversations
          const { data: longTermData, error: ltError } = await vectorStore
            .from("ai_memories")
            .select("content, metadata, created_at")
            .eq("user_id", userId)
            .eq("is_longterm", true)
            .order("created_at", { ascending: false })
            .limit(5);

          if (!ltError && longTermData) {
            console.log(
              `Found ${longTermData.length} long-term memories for user ${userId}`
            );
            results = [...longTermData, ...results];
          } else if (ltError) {
            console.error("Error fetching user long-term memories:", ltError);
          }

          // Special case for personal information retrieval
          if (
            query.toLowerCase().includes("name") ||
            query.toLowerCase().includes("who am i") ||
            query.toLowerCase().includes("about me") ||
            query.toLowerCase().includes("remember me")
          ) {
            // Get personal details explicitly using new columns + content filtering
            const { data: nameData, error: nameError } = await vectorStore
              .from("ai_memories")
              .select("id, content, metadata, created_at")
              .eq("user_id", userId)
              .or(`is_longterm.eq.true,metadata->>'isLongterm'.eq.true`)
              .or(
                "content.ilike.%my name is%,content.ilike.%name%,content.ilike.%i am%,content.ilike.%call me%"
              )
              .order("created_at", { ascending: false })
              .limit(10);

            if (!nameError && nameData && nameData.length > 0) {
              console.log(
                `Found ${nameData.length} memories with personal information`
              );
              // Add personal data at the beginning for priority
              results = [
                ...nameData,
                ...results.filter(
                  (item) =>
                    !nameData.some(
                      (p) =>
                        p.content === item.content &&
                        p.created_at === item.created_at
                    )
                ),
              ];
            }
          }
        }

        // Remove duplicates
        results = results.filter(
          (item, index, self) =>
            index ===
            self.findIndex(
              (t) =>
                t.content === item.content && t.created_at === item.created_at
            )
        );

        // Convert to Document format for consistent return type
        return results.map(
          (item) =>
            new Document({
              pageContent: item.content,
              metadata: {
                ...item.metadata,
                timestamp: item.created_at
                  ? new Date(item.created_at).getTime()
                  : Date.now(),
              },
            })
        );
      } catch (e) {
        console.error("Error during memory recall:", e);
        return [];
      }
    }

    return [];
  } catch (error) {
    console.error("Error recalling memory:", error);
    return [];
  }
}

export async function recallLongTermMemory(
  userId: string,
  query: string
): Promise<Document[]> {
  if (!userId) {
    console.error("User ID is required for long-term memory recall");
    return [];
  }

  try {
    console.log(`Recalling long-term memories for user: ${userId}`);
    const vectorStore = await getVectorStore();
    if (!vectorStore) {
      console.error("Vector store failed to initialize.");
      return [];
    }

    // Check if we got a vectorstore or just a Supabase client
    if (vectorStore instanceof SupabaseVectorStore) {
      // Use direct SQL filtering instead of the built-in filter capabilities
      try {
        const supabaseClient = (vectorStore as any).client;

        // Get long-term memories for this user using the is_longterm column
        const { data: columnData, error: columnError } = await supabaseClient
          .from("ai_memories")
          .select("id, content, metadata, created_at")
          .eq("user_id", userId)
          .eq("is_longterm", true)
          .order("created_at", { ascending: false })
          .limit(15);

        if (columnError) {
          console.error(
            "Error fetching long-term memories by column:",
            columnError
          );
        }

        // Get long-term memories using the metadata.isLongterm field for backward compatibility
        const { data: metadataData, error: metadataError } =
          await supabaseClient
            .from("ai_memories")
            .select("id, content, metadata, created_at")
            .eq("user_id", userId)
            .filter("metadata->>'isLongterm'", "eq", "true")
            .order("created_at", { ascending: false })
            .limit(15);

        if (metadataError) {
          console.error(
            "Error fetching long-term memories by metadata:",
            metadataError
          );
        }

        // Combine results and remove duplicates
        let combinedData: any[] = [];

        if (columnData && columnData.length > 0) {
          console.log(
            `Found ${columnData.length} memories with is_longterm=true`
          );
          combinedData = [...columnData];
        }

        if (metadataData && metadataData.length > 0) {
          console.log(
            `Found ${metadataData.length} memories with metadata.isLongterm=true`
          );
          // Add only non-duplicate entries
          metadataData.forEach((item: any) => {
            if (!combinedData.some((existing) => existing.id === item.id)) {
              combinedData.push(item);
            }
          });
        }

        console.log(`Combined long-term memories: ${combinedData.length}`);

        // Use the combined data as our results
        let results = combinedData || [];

        // Special search for personal information
        if (
          query.toLowerCase().includes("name") ||
          query.toLowerCase().includes("who am i") ||
          query.toLowerCase().includes("about me") ||
          query.toLowerCase().includes("remember me")
        ) {
          // Try direct personal info search
          const { data: nameData, error: nameError } = await supabaseClient
            .from("ai_memories")
            .select("id, content, metadata, created_at")
            .eq("user_id", userId)
            .or(`is_longterm.eq.true,metadata->>'isLongterm'.eq.true`)
            .or(
              "content.ilike.%my name is%,content.ilike.%name%,content.ilike.%i am%,content.ilike.%call me%"
            )
            .order("created_at", { ascending: false })
            .limit(10);

          if (!nameError && nameData && nameData.length > 0) {
            console.log(
              `Found ${nameData.length} personal info memories in long-term memory`
            );

            // Prioritize personal info memories
            results = [
              ...nameData,
              ...results.filter(
                (item: any) =>
                  !nameData.some(
                    (p: any) =>
                      p.content === item.content &&
                      p.created_at === item.created_at
                  )
              ),
            ];
          }
        }

        // Convert to Document format for consistent return type
        return results.map(
          (item: any) =>
            new Document({
              pageContent: item.content,
              metadata: {
                ...item.metadata,
                timestamp: item.created_at
                  ? new Date(item.created_at).getTime()
                  : Date.now(),
              },
            })
        );
      } catch (error) {
        console.error("Error during vectorstore long-term query:", error);
        // Fall back to the direct Supabase client method
        console.log(
          "Falling back to direct Supabase queries for long-term memory"
        );
      }
    }

    // Fallback to using Supabase client directly
    if (vectorStore && "from" in vectorStore) {
      console.log(
        "⚠️ FALLBACK: Using direct Supabase queries for long-term memory (no embeddings)"
      );
      try {
        // Get long-term memories for this user using the is_longterm column
        const { data: columnData, error: columnError } = await vectorStore
          .from("ai_memories")
          .select("id, content, metadata, created_at")
          .eq("user_id", userId)
          .eq("is_longterm", true)
          .order("created_at", { ascending: false })
          .limit(15);

        if (columnError) {
          console.error(
            "Error fetching long-term memories by column:",
            columnError
          );
        }

        // Get long-term memories using the metadata.isLongterm field for backward compatibility
        const { data: metadataData, error: metadataError } = await vectorStore
          .from("ai_memories")
          .select("id, content, metadata, created_at")
          .eq("user_id", userId)
          .filter("metadata->>'isLongterm'", "eq", "true")
          .order("created_at", { ascending: false })
          .limit(15);

        if (metadataError) {
          console.error(
            "Error fetching long-term memories by metadata:",
            metadataError
          );
        }

        // Combine results and remove duplicates
        let combinedData: any[] = [];

        if (columnData && columnData.length > 0) {
          console.log(
            `Found ${columnData.length} memories with is_longterm=true`
          );
          combinedData = [...columnData];
        }

        if (metadataData && metadataData.length > 0) {
          console.log(
            `Found ${metadataData.length} memories with metadata.isLongterm=true`
          );
          // Add only non-duplicate entries
          metadataData.forEach((item: any) => {
            if (!combinedData.some((existing) => existing.id === item.id)) {
              combinedData.push(item);
            }
          });
        }

        console.log(`Combined long-term memories: ${combinedData.length}`);

        // Use the combined data as our results
        let results = combinedData || [];

        // Special search for personal information
        if (
          query.toLowerCase().includes("name") ||
          query.toLowerCase().includes("who am i") ||
          query.toLowerCase().includes("about me") ||
          query.toLowerCase().includes("remember me")
        ) {
          // Try direct personal info search
          const { data: nameData, error: nameError } = await vectorStore
            .from("ai_memories")
            .select("id, content, metadata, created_at")
            .eq("user_id", userId)
            .or(`is_longterm.eq.true,metadata->>'isLongterm'.eq.true`)
            .or(
              "content.ilike.%my name is%,content.ilike.%name%,content.ilike.%i am%,content.ilike.%call me%"
            )
            .order("created_at", { ascending: false })
            .limit(10);

          if (!nameError && nameData && nameData.length > 0) {
            console.log(
              `Found ${nameData.length} personal info memories in long-term memory`
            );

            // Prioritize personal info memories
            results = [
              ...nameData,
              ...results.filter(
                (item: any) =>
                  !nameData.some(
                    (p: any) =>
                      p.content === item.content &&
                      p.created_at === item.created_at
                  )
              ),
            ];
          }
        }

        // Convert to Document format for consistent return type
        return results.map(
          (item: any) =>
            new Document({
              pageContent: item.content,
              metadata: {
                ...item.metadata,
                timestamp: item.created_at
                  ? new Date(item.created_at).getTime()
                  : Date.now(),
              },
            })
        );
      } catch (e) {
        console.error("Error during long-term memory recall:", e);
        return [];
      }
    }

    return [];
  } catch (error) {
    console.error("Error recalling long-term memory:", error);
    return [];
  }
}
