import { PGVectorStore } from "@langchain/community/vectorstores/pgvector";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { createClient } from "@supabase/supabase-js";

const embeddings = new GoogleGenerativeAIEmbeddings({
  model: "embedding-001",
  apiKey: process.env.GOOGLE_API_KEY,
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Missing required environment variables: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be defined."
  );
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Extract the project reference from the Supabase URL
const projectRef = supabaseUrl
  ?.replace("https://", "")
  .replace(".supabase.co", "");

// Create a function to initialize the vector store with proper error handling
export async function getVectorStore() {
  try {
    // Use Supavisor in transaction mode (port 6543) which is optimal for serverless functions
    const connectionString = `postgresql://postgres.${projectRef}:${supabaseKey}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;

    const pgvectorStore = await PGVectorStore.initialize(embeddings, {
      postgresConnectionOptions: {
        connectionString: connectionString,
        ssl: { rejectUnauthorized: false },
      },
      tableName: "ai_memories",
      columns: {
        idColumnName: "id",
        vectorColumnName: "embedding",
        contentColumnName: "content",
        metadataColumnName: "metadata",
      },
    });

    return pgvectorStore;
  } catch (error) {
    console.error("Error initializing vector store:", error);
    throw error;
  }
}
