import { createClient } from "@supabase/supabase-js";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { OpenAIEmbeddings } from "@langchain/openai";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";

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
      console.log("📊 Using Google AI embeddings for vector store");
      embeddings = new GoogleGenerativeAIEmbeddings({
        apiKey: googleApiKey,
        modelName: "embedding-001", // or whatever model you prefer
      });
    } else if (openaiApiKey) {
      console.log("📊 Using OpenAI embeddings for vector store");
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

    // Create and return the vector store
    const vectorStore = new SupabaseVectorStore(embeddings, {
      client,
      tableName: "ai_memories",
      queryName: "match_documents",
    });

    console.log("Vector store initialized with table: ai_memories");
    return vectorStore;
  } catch (error) {
    console.error("Error in getVectorStore:", error);
    return null;
  }
}
