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

    // Add detailed logging to debug the document structure
    console.log("===== DOCUMENT METADATA INSPECTION =====");
    console.log(
      "Full document metadata:",
      JSON.stringify(document.metadata, null, 2)
    );

    // Log the types of each field
    console.log("METADATA TYPES:");
    console.log(
      `  conversationId: ${document.metadata.conversationId} (${typeof document
        .metadata.conversationId})`
    );
    console.log(
      `  userId: ${document.metadata.userId} (${typeof document.metadata
        .userId})`
    );
    console.log(
      `  timestamp: ${document.metadata.timestamp} (${typeof document.metadata
        .timestamp})`
    );
    console.log(
      `  type: ${document.metadata.type} (${typeof document.metadata.type})`
    );
    console.log(
      `  isLongterm: ${document.metadata.isLongterm} (${typeof document.metadata
        .isLongterm})`
    );

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
        console.error("Error message:", (error as Error).message);
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

export async function saveToLongTermMemory(
  userId: string,
  userMessage: string,
  aiResponse: string
): Promise<boolean> {
  // Simply call saveMemory with isLongTerm set to true and a special conversation ID
  return saveMemory(
    `long-term-${userId}`, // Using a predictable conversationId for long-term memories
    userMessage,
    aiResponse,
    userId,
    true
  );
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
        // since our metadata is now stored as JSON
        try {
          const supabaseClient = (vectorStore as any).client;

          // First try to get conversation-specific memories
          const { data: conversationData, error: convError } =
            await supabaseClient
              .from("ai_memories")
              .select("content, metadata")
              .filter("metadata->>'conversationId'", "eq", conversationId)
              .order("metadata->>'timestamp'", { ascending: false })
              .limit(5);

          if (convError) {
            console.error("Error fetching conversation memories:", convError);
            return [];
          }

          let allResults = conversationData || [];

          // Also get long-term memories for this user
          const { data: longTermData, error: ltError } = await supabaseClient
            .from("ai_memories")
            .select("content, metadata")
            .filter("metadata->>'userId'", "eq", userId)
            .filter("metadata->>'isLongterm'", "eq", "true")
            .order("metadata->>'timestamp'", { ascending: false })
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
              .select("content, metadata")
              .filter("metadata->>'isLongterm'", "eq", "true")
              .filter("metadata->>'userId'", "eq", userId)
              .or(
                "content.ilike.%my name is%,content.ilike.%name%,content.ilike.%i am%,content.ilike.%call me%"
              )
              .order("metadata->>'timestamp'", { ascending: false })
              .limit(5);

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
                        p.metadata.timestamp === item.metadata.timestamp
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
                metadata: item.metadata || {},
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
            .select("content, metadata")
            .filter("metadata->>'conversationId'", "eq", conversationId)
            .order("metadata->>'timestamp'", { ascending: false })
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
                metadata: item.metadata || {},
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
        // Start with conversation-based memories
        const { data: conversationData, error: convError } = await vectorStore
          .from("ai_memories")
          .select("content, metadata")
          .filter("metadata->>'conversationId'", "eq", conversationId)
          .order("metadata->>'timestamp'", { ascending: false })
          .limit(5);

        if (convError) {
          console.error("Error fetching conversation memories:", convError);
          return [];
        }

        let results = conversationData || [];

        // If userId is provided, also fetch long-term memories
        if (userId) {
          // Fetch long-term memories across all conversations
          const { data: longTermData, error: ltError } = await vectorStore
            .from("ai_memories")
            .select("content, metadata")
            .filter("metadata->>'userId'", "eq", userId)
            .filter("metadata->>'isLongterm'", "eq", "true")
            .order("metadata->>'timestamp'", { ascending: false })
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
            // Get personal details explicitly
            const { data: nameData, error: nameError } = await vectorStore
              .from("ai_memories")
              .select("content, metadata")
              .filter("metadata->>'userId'", "eq", userId)
              .filter("metadata->>'isLongterm'", "eq", "true")
              .or(
                "content.ilike.%my name is%,content.ilike.%name%,content.ilike.%i am%,content.ilike.%call me%"
              )
              .order("metadata->>'timestamp'", { ascending: false })
              .limit(5);

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
                        p.metadata.timestamp === item.metadata.timestamp
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
                t.content === item.content &&
                t.metadata.timestamp === item.metadata.timestamp
            )
        );

        // Convert to Document format for consistent return type
        return results.map(
          (item) =>
            new Document({
              pageContent: item.content,
              metadata: item.metadata || {},
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

        // Get long-term memories for this user
        const { data: userData, error: userError } = await supabaseClient
          .from("ai_memories")
          .select("content, metadata")
          .filter("metadata->>'userId'", "eq", userId)
          .filter("metadata->>'isLongterm'", "eq", "true")
          .order("metadata->>'timestamp'", { ascending: false })
          .limit(10);

        if (userError) {
          console.error("Error fetching long-term memories:", userError);
          return [];
        }

        let results = userData || [];

        // Special handling for personal information queries
        if (
          query.toLowerCase().includes("name") ||
          query.toLowerCase().includes("who am i") ||
          query.toLowerCase().includes("about me")
        ) {
          // Try direct personal info search
          const { data: nameData, error: nameError } = await supabaseClient
            .from("ai_memories")
            .select("content, metadata")
            .filter("metadata->>'isLongterm'", "eq", "true")
            .filter("metadata->>'userId'", "eq", userId)
            .or(
              "content.ilike.%my name is%,content.ilike.%name%,content.ilike.%i am%,content.ilike.%call me%"
            )
            .order("metadata->>'timestamp'", { ascending: false })
            .limit(5);

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
                      p.metadata.timestamp === item.metadata.timestamp
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
              metadata: item.metadata || {},
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
        // Get long-term memories for this user
        const { data: userData, error: userError } = await vectorStore
          .from("ai_memories")
          .select("content, metadata")
          .filter("metadata->>'userId'", "eq", userId)
          .filter("metadata->>'isLongterm'", "eq", "true")
          .order("metadata->>'timestamp'", { ascending: false })
          .limit(10);

        if (userError) {
          console.error("Error fetching long-term memories:", userError);
          return [];
        }

        let results = userData || [];

        // Special search for personal information
        if (
          query.toLowerCase().includes("name") ||
          query.toLowerCase().includes("who am i") ||
          query.toLowerCase().includes("about me") ||
          query.toLowerCase().includes("remember me")
        ) {
          const { data: nameData, error: nameError } = await vectorStore
            .from("ai_memories")
            .select("content, metadata")
            .filter("metadata->>'userId'", "eq", userId)
            .filter("metadata->>'isLongterm'", "eq", "true")
            .or(
              "content.ilike.%my name is%,content.ilike.%name%,content.ilike.%i am%,content.ilike.%call me%"
            )
            .order("metadata->>'timestamp'", { ascending: false })
            .limit(5);

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
                      p.metadata.timestamp === item.metadata.timestamp
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
              metadata: item.metadata || {},
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
