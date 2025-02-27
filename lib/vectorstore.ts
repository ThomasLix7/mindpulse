import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;

export async function getVectorStore() {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase
      .from("profiles")
      .select("id")
      .limit(1);

    if (error) {
      console.error("Simplified DB test query error:", error);
      throw error;
    }
    console.log("Simplified DB test query successful:", data);
    return supabase;
  } catch (error) {
    console.error("Error in simplified getVectorStore:", error);
    throw error;
  }
}
