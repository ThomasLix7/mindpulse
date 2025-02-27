import { useState } from "react";
import { Box, Button, Text, Link } from "@chakra-ui/react";

export default function DatabaseSetup() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{
    success?: boolean;
    message?: string;
    error?: string;
  } | null>(null);

  const setupDatabase = async () => {
    setIsLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/setup-db");
      const data = await response.json();

      setResult(data);
    } catch (error) {
      setResult({
        success: false,
        error: "Failed to setup database. See console for details.",
      });
      console.error("Database setup error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Box padding={4} borderWidth="1px" borderRadius="lg" marginBottom={6}>
      <Text fontWeight="bold" marginBottom={2}>
        Database Setup
      </Text>

      <Text marginBottom={4} fontSize="sm">
        If you're experiencing database connection issues, click the button
        below to set up the required pgvector extension and tables in your
        Supabase project.
      </Text>

      {result && (
        <Box
          backgroundColor={result.success ? "green.100" : "red.100"}
          color={result.success ? "green.800" : "red.800"}
          borderRadius="md"
          marginBottom={4}
          padding={3}
        >
          {result.success ? result.message : result.error}
        </Box>
      )}

      <Button
        onClick={setupDatabase}
        isLoading={isLoading}
        loadingText="Setting up..."
        size="sm"
        colorScheme={result?.success ? "green" : "blue"}
      >
        {result?.success ? "Database Setup Complete" : "Setup Database"}
      </Button>

      {!result?.success && (
        <Text fontSize="xs" marginTop={2}>
          If setup fails, you may need to manually enable the pgvector extension
          in your{" "}
          <Link
            href="https://supabase.com/dashboard"
            target="_blank"
            color="blue.500"
          >
            Supabase Dashboard
          </Link>
        </Text>
      )}
    </Box>
  );
}
