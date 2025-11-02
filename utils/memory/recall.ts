import { getVectorStore } from "@/lib/vectorstore";
import { createServerClient } from "@/utils/supabase-server";
import { Document } from "@langchain/core/documents";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";

async function getCourseSummary(
  client: any,
  courseId: string,
  userId: string
): Promise<any | null> {
  const { data: summaryData } = await client
    .from("ai_memories")
    .select("id, content, metadata, created_at")
    .eq("course_id", courseId)
    .eq("user_id", userId)
    .eq("is_longterm", false)
    .filter("metadata->>'type'", "eq", "course_summary")
    .limit(1)
    .single();

  return summaryData || null;
}

async function getLongTermMemories(
  vectorStore: any,
  client: any,
  query: string,
  userId: string,
  useVectorSearch: boolean
): Promise<Document[]> {
  if (useVectorSearch && vectorStore instanceof SupabaseVectorStore) {
    try {
      const searchResults = await vectorStore.similaritySearch(
        query || "learning progress and important concepts",
        5,
        {
          userId: userId,
          isLongterm: true,
        }
      );
      if (searchResults && searchResults.length > 0) {
        console.log(
          `Found ${searchResults.length} relevant memories via vector search`
        );
        return searchResults;
      }
    } catch (error) {
      console.error("Vector search failed, falling back to recent:", error);
    }
  }

  const { data: longTermData, error } = await client
    .from("ai_memories")
    .select("id, content, metadata, created_at")
    .eq("user_id", userId)
    .eq("is_longterm", true)
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    console.error("Error fetching long-term memories:", error);
    return [];
  }

  return (longTermData || []).map(
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
}

function mapToDocuments(items: any[]): Document[] {
  return items.map(
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
}

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

    const isVectorStore = vectorStore instanceof SupabaseVectorStore;
    const client = isVectorStore ? (vectorStore as any).client : vectorStore;

    if (!userId) {
      const { data, error } = await client
        .from("ai_memories")
        .select("content, metadata, created_at")
        .eq("course_id", courseId)
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) {
        console.error("Error fetching anonymous course memories:", error);
        return [];
      }

      return mapToDocuments(data || []);
    }

    try {
      const courseSummary = await getCourseSummary(client, courseId, userId);
      const longTermMemories = await getLongTermMemories(
        vectorStore,
        client,
        query,
        userId,
        isVectorStore
      );

      let allResults = longTermMemories || [];

      if (courseSummary) {
        allResults = [
          new Document({
            pageContent: courseSummary.content,
            metadata: {
              ...courseSummary.metadata,
              timestamp: courseSummary.created_at
                ? new Date(courseSummary.created_at).getTime()
                : Date.now(),
            },
          }),
          ...allResults,
        ];
      }

      return allResults;
    } catch (error) {
      console.error("Error during memory recall:", error);
      return [];
    }
  } catch (error) {
    console.error("Error recalling memory:", error);
    return [];
  }
}

export async function recallLongTermMemory(
  userId: string,
  accessToken?: string
): Promise<Document[]> {
  if (!userId) {
    console.error("User ID is required for long-term memory recall");
    return [];
  }

  try {
    const client = createServerClient(accessToken);

    const { data: columnData, error: columnError } = await client
      .from("ai_memories")
      .select("id, content, metadata, created_at")
      .eq("user_id", userId)
      .eq("is_longterm", true)
      .order("created_at", { ascending: false });

    if (columnError) {
      console.error(
        "Error fetching long-term memories by column:",
        columnError
      );
    }

    const { data: metadataData, error: metadataError } = await client
      .from("ai_memories")
      .select("id, content, metadata, created_at")
      .eq("user_id", userId)
      .filter("metadata->>'isLongterm'", "eq", "true")
      .order("created_at", { ascending: false });

    if (metadataError) {
      console.error(
        "Error fetching long-term memories by metadata:",
        metadataError
      );
    }

    let combinedData: any[] = [];

    if (columnData && columnData.length > 0) {
      combinedData = [...columnData];
    }

    if (metadataData && metadataData.length > 0) {
      metadataData.forEach((item: any) => {
        if (!combinedData.some((existing) => existing.id === item.id)) {
          combinedData.push(item);
        }
      });
    }

    return mapToDocuments(combinedData);
  } catch (error) {
    console.error("Error recalling long-term memory:", error);
    return [];
  }
}
