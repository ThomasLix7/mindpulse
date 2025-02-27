import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        "Missing required environment variables: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY must be defined."
      );
    }

    // Create a Supabase client
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
      },
    });

    // SQL command to check if pgvector extension exists
    const { data: extensionData, error: extensionError } = await supabase.rpc(
      "check_extension_exists",
      { extension_name: "vector" }
    );

    if (extensionError) {
      // If the RPC doesn't exist, we'll create it
      await supabase.rpc("create_check_extension_function");

      // Try again
      const { data: retryData, error: retryError } = await supabase.rpc(
        "check_extension_exists",
        { extension_name: "vector" }
      );

      if (retryError) {
        console.error("Error checking pgvector extension:", retryError);
        return NextResponse.json(
          { success: false, error: "Failed to check pgvector extension" },
          { status: 500 }
        );
      }

      if (!retryData) {
        // Extension doesn't exist, so create it
        console.log("Creating pgvector extension...");
        const { error: createError } = await supabase.rpc(
          "create_vector_extension"
        );

        if (createError) {
          console.error("Error creating pgvector extension:", createError);
          return NextResponse.json(
            {
              success: false,
              error: "Failed to create pgvector extension",
              message:
                "You may need to enable the pgvector extension from the Supabase dashboard",
            },
            { status: 500 }
          );
        }
      }
    }

    // Check if ai_memories table exists
    const { data: tableData, error: tableError } = await supabase
      .from("ai_memories")
      .select("id")
      .limit(1);

    if (tableError) {
      if (tableError.code === "PGRST116") {
        // Table doesn't exist, so create it
        console.log("Creating ai_memories table...");

        // SQL to create the table
        const { error: createTableError } = await supabase.rpc(
          "create_ai_memories_table"
        );

        if (createTableError) {
          console.error("Error creating ai_memories table:", createTableError);
          return NextResponse.json(
            { success: false, error: "Failed to create ai_memories table" },
            { status: 500 }
          );
        }
      } else {
        console.error("Error checking ai_memories table:", tableError);
        return NextResponse.json(
          { success: false, error: "Failed to check ai_memories table" },
          { status: 500 }
        );
      }
    }

    // Check if profiles table exists
    const { data: profilesData, error: profilesError } = await supabase
      .from("profiles")
      .select("id")
      .limit(1);

    if (profilesError) {
      if (profilesError.code === "PGRST116") {
        // Profiles table doesn't exist, so create it
        console.log("Creating profiles table...");

        // Execute SQL to create the profiles table
        const { error: createProfilesError } = await supabase.rpc(
          "create_profiles_table"
        );

        if (createProfilesError) {
          console.error("Error creating profiles table:", createProfilesError);
          return NextResponse.json(
            { success: false, error: "Failed to create profiles table" },
            { status: 500 }
          );
        }
      } else {
        console.error("Error checking profiles table:", profilesError);
        return NextResponse.json(
          { success: false, error: "Failed to check profiles table" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: "Database setup completed successfully",
    });
  } catch (error: any) {
    console.error("Setup-db error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "An unknown error occurred" },
      { status: 500 }
    );
  }
}
