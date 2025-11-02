import { getVectorStore } from "@/lib/vectorstore";
import { Document } from "@langchain/core/documents";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";

export async function recallMemory(
  courseId: string,
  query: string,
  userId?: string,
  accessToken?: string
): Promise<Document[]> {
  try {
    console.log(
      `Recalling memory for course: ${courseId}, user: ${userId || "anonymous"}`
    );

    const vectorStore = await getVectorStore(accessToken);
    if (!vectorStore) {
      console.error("Vector store failed to initialize.");
      return [];
    }

    if (vectorStore instanceof SupabaseVectorStore) {
      if (userId) {
        try {
          const supabaseClient = (vectorStore as any).client;

          // Get course summary (short-term, course-specific)
          let courseSummary: any = null;
          const { data: summaryData } = await supabaseClient
            .from("ai_memories")
            .select("id, content, metadata, created_at")
            .eq("course_id", courseId)
            .eq("user_id", userId)
            .eq("is_longterm", false)
            .filter("metadata->>'type'", "eq", "course_summary")
            .limit(1)
            .single();

          if (summaryData) {
            courseSummary = summaryData;
            console.log("Retrieved course summary");
          }

          // Get all long-term memories for this user (includes both course-specific and user-wide)
          const { data: longTermData, error: ltError } = await supabaseClient
            .from("ai_memories")
            .select("id, content, metadata, created_at")
            .eq("user_id", userId)
            .eq("is_longterm", true)
            .order("created_at", { ascending: false })
            .limit(5);

          if (ltError) {
            console.error("Error fetching long-term memories:", ltError);
            return [];
          }

          let allResults = longTermData || [];

          if (courseSummary) {
            allResults = [courseSummary, ...allResults];
          }

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
          console.log("Falling back to direct Supabase queries");
        }
      } else {
        try {
          const supabaseClient = (vectorStore as any).client;
          const { data, error } = await supabaseClient
            .from("ai_memories")
            .select("content, metadata, created_at")
            .eq("course_id", courseId)
            .order("created_at", { ascending: false })
            .limit(5);

          if (error) {
            console.error("Error fetching anonymous course memories:", error);
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
          console.log("Falling back to direct Supabase queries");
        }
      }
    }

    // Fallback or direct client case
    if (vectorStore && "from" in vectorStore) {
      console.log(
        "⚠️ FALLBACK: Using direct Supabase queries for memory recall (no embeddings)"
      );
      try {
        // Get course summary
        let courseSummary: Document | null = null;
        if (userId) {
          const { data: summaryData } = await vectorStore
            .from("ai_memories")
            .select("content, metadata, created_at")
            .eq("course_id", courseId)
            .eq("user_id", userId)
            .eq("is_longterm", false)
            .filter("metadata->>'type'", "eq", "course_summary")
            .limit(1)
            .single();

          if (summaryData) {
            courseSummary = new Document({
              pageContent: summaryData.content,
              metadata: {
                ...summaryData.metadata,
                timestamp: summaryData.created_at
                  ? new Date(summaryData.created_at).getTime()
                  : Date.now(),
                type: "course_summary",
              },
            });
            console.log("Retrieved course summary");
          }
        }

        // Get all long-term memories for this user (includes both course-specific and user-wide)
        let results: any[] = [];

        if (userId) {
          const { data: longTermData, error: ltError } = await vectorStore
            .from("ai_memories")
            .select("content, metadata, created_at")
            .eq("user_id", userId)
            .eq("is_longterm", true)
            .order("created_at", { ascending: false })
            .limit(5);

          if (ltError) {
            console.error("Error fetching long-term memories:", ltError);
            return [];
          }

          results = longTermData || [];
        }

        if (courseSummary) {
          results = [
            {
              content: courseSummary.pageContent,
              metadata: courseSummary.metadata,
              created_at: new Date(
                courseSummary.metadata.timestamp
              ).toISOString(),
            },
            ...results,
          ];
        }

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
  query: string,
  accessToken?: string
): Promise<Document[]> {
  if (!userId) {
    console.error("User ID is required for long-term memory recall");
    return [];
  }

  try {
    console.log(`Recalling long-term memories for user: ${userId}`);
    const vectorStore = await getVectorStore(accessToken);
    if (!vectorStore) {
      console.error("Vector store failed to initialize.");
      return [];
    }

    if (vectorStore instanceof SupabaseVectorStore) {
      try {
        const supabaseClient = (vectorStore as any).client;

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
          metadataData.forEach((item: any) => {
            if (!combinedData.some((existing) => existing.id === item.id)) {
              combinedData.push(item);
            }
          });
        }

        console.log(`Combined long-term memories: ${combinedData.length}`);

        let results = combinedData || [];

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
          metadataData.forEach((item: any) => {
            if (!combinedData.some((existing) => existing.id === item.id)) {
              combinedData.push(item);
            }
          });
        }

        console.log(`Combined long-term memories: ${combinedData.length}`);

        let results = combinedData || [];

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
