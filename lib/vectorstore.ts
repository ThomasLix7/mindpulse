import { createClient } from "@supabase/supabase-js";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { OpenAIEmbeddings } from "@langchain/openai";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { Document } from "@langchain/core/documents";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const googleApiKey = process.env.GOOGLE_API_KEY;
const openaiApiKey = process.env.OPENAI_API_KEY;

export async function getVectorStore(accessToken?: string) {
  try {
    const client = createClient(supabaseUrl, supabaseKey, {
      global: accessToken
        ? {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        : undefined,
    });

    const { data, error } = await client.from("profiles").select("id").limit(1);

    if (error) {
      console.error("Supabase connection test error:", error);
      return null;
    }

    let embeddings;
    if (googleApiKey) {
      embeddings = new GoogleGenerativeAIEmbeddings({
        apiKey: googleApiKey,
        modelName: "gemini-embedding-001",
        maxRetries: 0,
      });

      embeddings.embedQuery = async function (text: string) {
        const { GoogleGenerativeAI } = await import("@google/generative-ai");
        const genAI = new GoogleGenerativeAI(googleApiKey);
        const model = genAI.getGenerativeModel({
          model: "gemini-embedding-001",
        });

        const result = await model.embedContent({
          content: { role: "user", parts: [{ text }] },
          outputDimensionality: 1536,
        } as any);

        return result.embedding.values;
      };

      embeddings.embedDocuments = async function (texts: string[]) {
        const { GoogleGenerativeAI } = await import("@google/generative-ai");
        const genAI = new GoogleGenerativeAI(googleApiKey);
        const model = genAI.getGenerativeModel({
          model: "gemini-embedding-001",
        });

        const embeddings = await Promise.all(
          texts.map(async (text) => {
            const result = await model.embedContent({
              content: { role: "user", parts: [{ text }] },
              outputDimensionality: 1536,
            } as any);
            return result.embedding.values;
          })
        );

        return embeddings;
      };
    } else if (openaiApiKey) {
      embeddings = new OpenAIEmbeddings({
        openAIApiKey: openaiApiKey,
      });
    } else {
      console.error("No embedding API keys available");
      console.log(
        "⚠️ FALLBACK: No embedding models available - using direct Supabase client without embeddings"
      );
      return client;
    }

    const vectorStore = new SupabaseVectorStore(embeddings, {
      client,
      tableName: "ai_memories",
      queryName: "match_documents",
    });

    vectorStore.addDocuments = async function (
      documents: Document[],
      options?: any
    ) {
      try {
        if (documents.length === 0) {
          console.warn("No documents to add");
          return [];
        }

        const texts = documents.map((doc) => doc.pageContent);
        let embeddings_vectors: number[][] = [];

        try {
          embeddings_vectors = await embeddings.embedDocuments(texts);
          console.log("Embeddings generated successfully");
        } catch (embeddingError) {
          console.error("Failed to generate embeddings:", embeddingError);
          console.log("Proceeding without embeddings");
          embeddings_vectors = documents.map(() => []);
        }

        const ids = documents.map(() => crypto.randomUUID());

        const enhancedDocuments = documents.map((doc, i) => {
          const metadata = { ...doc.metadata };

          const isLongterm =
            metadata.isLongterm === true || metadata.is_longterm === true;

          metadata.isLongterm = isLongterm;

          return {
            id: ids[i],
            content: doc.pageContent,
            metadata: metadata,
            embedding: embeddings_vectors[i] || null,
            is_longterm: isLongterm,
          };
        });

        try {
          for (let i = 0; i < enhancedDocuments.length; i++) {
            const doc = enhancedDocuments[i];

            try {
              const { data, error } = await client.from("ai_memories").insert({
                id: doc.id,
                content: doc.content,
                metadata: doc.metadata,
                embedding: doc.embedding,
                is_longterm: doc.is_longterm,
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
          console.log("Falling back to individual insertions...");
        }

        try {
          console.log("Trying standard insert approach...");

          const successfulIds = [];

          for (let i = 0; i < enhancedDocuments.length; i++) {
            try {
              const doc = enhancedDocuments[i];

              const { error } = await client.from("ai_memories").insert({
                id: doc.id,
                content: doc.content,
                metadata: doc.metadata,
                is_longterm: doc.is_longterm,
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

        console.error("All insertion methods failed");
        throw new Error(
          "Could not insert documents using any available method"
        );
      } catch (error) {
        console.error("Error in custom addDocuments:", error);
        throw error;
      }
    };

    const originalSimilaritySearch =
      vectorStore.similaritySearch.bind(vectorStore);
    vectorStore.similaritySearch = async function (
      query: string,
      k = 4,
      filter = undefined
    ) {
      if (
        filter &&
        ((filter as any).isLongterm !== undefined || (filter as any).userId)
      ) {
        try {
          const embeddings = (vectorStore as any).embeddings;
          if (!embeddings) {
            throw new Error("No embeddings model available");
          }

          const queryEmbedding = await embeddings.embedQuery(query);

          let baseQuery = client
            .from("ai_memories")
            .select("id, content, metadata, created_at, vector, is_longterm")
            .not("vector", "is", null);

          if ((filter as any).userId) {
            baseQuery = baseQuery.eq("user_id", (filter as any).userId);
          }

          if ((filter as any).isLongterm !== undefined) {
            baseQuery = baseQuery.eq("is_longterm", (filter as any).isLongterm);
          }

          const { data: filteredRecords, error: filterError } = await baseQuery;

          if (filterError) {
            throw filterError;
          }

          if (!filteredRecords || filteredRecords.length === 0) {
            return [];
          }
          const resultsWithSimilarity = filteredRecords
            .map((item: any) => {
              let vector: number[] = null as any;

              if (item.vector) {
                if (Array.isArray(item.vector)) {
                  vector = item.vector;
                } else if (typeof item.vector === "string") {
                  try {
                    vector = JSON.parse(item.vector);
                  } catch (e) {
                    return null;
                  }
                } else if (
                  item.vector &&
                  typeof item.vector === "object" &&
                  "toArray" in item.vector
                ) {
                  vector = item.vector.toArray();
                }
              }

              if (
                !vector ||
                !Array.isArray(vector) ||
                vector.length !== queryEmbedding.length
              ) {
                return null;
              }
              const dotProduct = queryEmbedding.reduce(
                (sum: number, val: number, i: number) => sum + val * vector[i],
                0
              );
              const queryMagnitude = Math.sqrt(
                queryEmbedding.reduce(
                  (sum: number, val: number) => sum + val * val,
                  0
                )
              );
              const itemMagnitude = Math.sqrt(
                vector.reduce((sum: number, val: number) => sum + val * val, 0)
              );

              if (queryMagnitude === 0 || itemMagnitude === 0) {
                return null;
              }

              const similarity = dotProduct / (queryMagnitude * itemMagnitude);

              if (isNaN(similarity) || !isFinite(similarity)) {
                return null;
              }

              return {
                ...item,
                similarity,
              };
            })
            .filter((item: any) => item !== null)
            .sort((a: any, b: any) => b.similarity - a.similarity)
            .slice(0, k);

          return resultsWithSimilarity.map(
            (item: any) =>
              new Document({
                pageContent: item.content,
                metadata: {
                  ...(item.metadata || {}),
                  id: item.id,
                  is_longterm: item.is_longterm,
                  timestamp: item.created_at
                    ? new Date(item.created_at).getTime()
                    : Date.now(),
                },
              })
          );
        } catch (error: any) {
          console.error(
            "Vector search with filters failed, falling back:",
            error?.message || error
          );
        }
      }

      // Fallback: text-based search with filters
      try {
        let queryBuilder = client
          .from("ai_memories")
          .select("id, content, metadata, created_at");

        if (filter) {
          if ((filter as any).userId) {
            queryBuilder = queryBuilder.eq("user_id", (filter as any).userId);
          }

          if ((filter as any).isLongterm !== undefined) {
            queryBuilder = queryBuilder.eq(
              "is_longterm",
              (filter as any).isLongterm
            );
          }

          if ((filter as any).courseId) {
            queryBuilder = queryBuilder.filter(
              "metadata->>courseId",
              "eq",
              (filter as any).courseId
            );
          }
        }

        const { data, error } = await queryBuilder
          .order("created_at", { ascending: false })
          .limit(k);

        if (error) {
          throw error;
        }

        return (data || []).map(
          (item: any) =>
            new Document({
              pageContent: item.content,
              metadata: {
                ...(item.metadata || {}),
                timestamp: item.created_at
                  ? new Date(item.created_at).getTime()
                  : Date.now(),
              },
            })
        );
      } catch (fallbackError) {
        try {
          return await originalSimilaritySearch(query, k, filter);
        } catch (originalError) {
          console.error("All search attempts failed:", originalError);
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
