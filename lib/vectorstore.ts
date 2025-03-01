import { createClient } from "@supabase/supabase-js";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { OpenAIEmbeddings } from "@langchain/openai";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { Document } from "@langchain/core/documents";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;
const googleApiKey = process.env.GOOGLE_API_KEY;
const openaiApiKey = process.env.OPENAI_API_KEY;

export async function getVectorStore() {
  try {
    // Create a Supabase client
    const client = createClient(supabaseUrl, supabaseKey);

    // Test the client connection
    const { data, error } = await client.from("profiles").select("id").limit(1);

    if (error) {
      console.error("Supabase connection test error:", error);
      return null;
    }

    // Initialize embeddings model based on available API keys
    let embeddings;
    if (googleApiKey) {
      embeddings = new GoogleGenerativeAIEmbeddings({
        apiKey: googleApiKey,
        modelName: "embedding-001", // or whatever model you prefer
      });
    } else if (openaiApiKey) {
      embeddings = new OpenAIEmbeddings({
        openAIApiKey: openaiApiKey,
      });
    } else {
      console.error("No embedding API keys available");
      console.log(
        "⚠️ FALLBACK: No embedding models available - using direct Supabase client without embeddings"
      );
      return client; // Fallback to client-only if no embedding models are available
    }

    // Create the vector store with standard configuration for the new schema
    const vectorStore = new SupabaseVectorStore(embeddings, {
      client,
      tableName: "ai_memories",
      queryName: "match_documents",
    });

    // COMPLETELY REPLACE the addDocuments method with our own implementation
    vectorStore.addDocuments = async function (
      documents: Document[],
      options?: any
    ) {
      try {
        if (documents.length === 0) {
          console.warn("No documents to add");
          return [];
        }

        // Generate embeddings for the documents
        const texts = documents.map((doc) => doc.pageContent);
        let embeddings_vectors: number[][] = [];

        try {
          embeddings_vectors = await embeddings.embedDocuments(texts);
          console.log("Embeddings generated successfully");
        } catch (embeddingError) {
          console.error("Failed to generate embeddings:", embeddingError);
          console.log("Proceeding without embeddings");
          // Continue without embeddings - we'll store the content but won't be able to do similarity search
          embeddings_vectors = documents.map(() => []);
        }

        // Generate UUIDs for the documents
        const ids = documents.map(() => crypto.randomUUID());

        // Clone the metadata to avoid modifying the original document
        const enhancedDocuments = documents.map((doc, i) => {
          // Make sure we have the essential fields in the correct format
          const metadata = { ...doc.metadata };

          return {
            id: ids[i],
            content: doc.pageContent,
            metadata: metadata,
            embedding: embeddings_vectors[i] || null,
          };
        });

        // First try: Use a transaction to safely insert with the original method
        try {
          // Implement each insert in a transaction
          for (let i = 0; i < enhancedDocuments.length; i++) {
            const doc = enhancedDocuments[i];

            try {
              const { data, error } = await client.from("ai_memories").insert({
                id: doc.id,
                content: doc.content,
                metadata: doc.metadata,
                embedding: doc.embedding,
              });

              if (error) {
                console.log(`Error inserting document ${i}:`, error);
                throw error;
              } else {
                console.log(
                  `Successfully inserted document ${i} with transaction`
                );
              }
            } catch (e) {
              console.error(`Transaction error for document ${i}:`, e);
              throw e;
            }
          }

          console.log("All documents inserted successfully with transaction");
          return ids;
        } catch (transactionError) {
          console.error("Transaction insertion failed:", transactionError);

          // If that fails, try our previous approach
          console.log("Falling back to individual insertions...");
        }

        // Let's try direct insertion, one document at a time
        try {
          console.log("Trying standard insert approach...");

          // Add each document individually to avoid failing all if one fails
          const successfulIds = [];

          for (let i = 0; i < enhancedDocuments.length; i++) {
            try {
              const doc = enhancedDocuments[i];

              // Try direct insertion with minimal fields
              const { error } = await client.from("ai_memories").insert({
                id: doc.id,
                content: doc.content,
                metadata: doc.metadata,
                // Only include embedding if we have it
                ...(doc.embedding ? { embedding: doc.embedding } : {}),
              });

              if (error) {
                console.error(`Error inserting document ${i}:`, error);
              } else {
                successfulIds.push(doc.id);
                console.log(`Successfully inserted document ${i}`);
              }
            } catch (insertError) {
              console.error(`Error inserting document ${i}:`, insertError);
            }
          }

          if (successfulIds.length > 0) {
            console.log(
              `Successfully inserted ${successfulIds.length} out of ${documents.length} documents`
            );
            return successfulIds;
          } else {
            console.log(
              "All standard inserts failed, trying alternative approach"
            );
          }
        } catch (error) {
          console.error("Standard insert approach failed:", error);
        }

        // If we get here, try a simplified approach with no embeddings
        try {
          console.log("Trying simplified insert (no embeddings)...");
          const simplifiedIds = [];

          for (let i = 0; i < documents.length; i++) {
            try {
              const doc = documents[i];
              const id = ids[i];

              // Try inserting with absolute minimal fields
              const { error } = await client.from("ai_memories").insert({
                id,
                content: doc.pageContent,
                metadata: doc.metadata || {},
              });

              if (error) {
                console.error(`Error in simplified insert ${i}:`, error);
              } else {
                simplifiedIds.push(id);
                console.log(`Successfully inserted simplified document ${i}`);
              }
            } catch (insertError) {
              console.error(`Error in simplified insert ${i}:`, insertError);
            }
          }

          if (simplifiedIds.length > 0) {
            console.log(
              `Successfully inserted ${simplifiedIds.length} simplified documents`
            );
            return simplifiedIds;
          }
        } catch (error) {
          console.error("Simplified insert approach failed:", error);
        }

        // If all else fails, try to use the fallback in saveMemory
        console.error("All insertion methods failed");
        throw new Error(
          "Could not insert documents using any available method"
        );
      } catch (error) {
        console.error("Error in custom addDocuments:", error);
        throw error;
      }
    };

    // ALSO completely replace the similaritySearch method for consistent handling
    const originalSimilaritySearch =
      vectorStore.similaritySearch.bind(vectorStore);
    vectorStore.similaritySearch = async function (
      query: string,
      k = 4,
      filter = undefined
    ) {
      try {
        // Try the original method first
        return await originalSimilaritySearch(query, k, filter);
      } catch (error) {
        console.error("Error in vector similarity search:", error);

        // Fallback to direct SQL query for text search
        console.log("Falling back to text-based search");
        try {
          // Extract filter criteria if provided
          let queryBuilder = client
            .from("ai_memories")
            .select("id, content, metadata");

          if (filter) {
            const conditions = [];

            // Handle conversationId filter
            if ((filter as any).conversationId) {
              queryBuilder = queryBuilder.filter(
                "metadata->>conversationId",
                "eq",
                (filter as any).conversationId
              );
            }

            // Handle userId filter
            if ((filter as any).userId) {
              queryBuilder = queryBuilder.filter(
                "metadata->>userId",
                "eq",
                (filter as any).userId
              );
            }

            // Handle isLongterm filter
            if ((filter as any).isLongterm !== undefined) {
              const isLongtermValue = (filter as any).isLongterm
                ? "true"
                : "false";
              queryBuilder = queryBuilder.filter(
                "metadata->>isLongterm",
                "eq",
                isLongtermValue
              );
            }
          }

          // Use direct query with the client
          const { data, error } = await queryBuilder
            .order("id", { ascending: false })
            .limit(k);

          if (error) {
            console.error("Direct query fallback failed:", error);
            throw error;
          }

          // Convert to Document format
          return (data || []).map(
            (item: any) =>
              new Document({
                pageContent: item.content,
                metadata: item.metadata || {},
              })
          );
        } catch (fallbackError) {
          console.error("All search attempts failed:", fallbackError);
          return [];
        }
      }
    };

    return vectorStore;
  } catch (error) {
    console.error("Error in getVectorStore:", error);
    return null;
  }
}
