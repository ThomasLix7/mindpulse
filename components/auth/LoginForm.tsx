"use client";

import { useState } from "react";
import { signIn } from "@/utils/supabase-client";
import { Box, Input, Button, Stack, Text, Field } from "@chakra-ui/react";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data, error } = await signIn(email, password);

      if (error) {
        throw error;
      }

      if (data) {
        router.push("/"); // Redirect to home page
        router.refresh(); // Refresh the page to update auth state
      }
    } catch (error: any) {
      setError(error.message || "Failed to sign in");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box maxW="md" mx="auto" mt={8}>
      <form onSubmit={handleLogin}>
        <Stack direction="column" gap={4} alignItems="flex-start">
          <Text fontSize="2xl" fontWeight="bold">
            Sign In
          </Text>

          {error && (
            <Box p={3} bg="red.100" color="red.700" borderRadius="md" w="100%">
              {error}
            </Box>
          )}

          <Field.Root>
            <Field.Label>Email</Field.Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
            />
          </Field.Root>

          <Field.Root>
            <Field.Label>Password</Field.Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
            />
          </Field.Root>

          <Button
            type="submit"
            colorScheme="blue"
            width="full"
            isLoading={loading}
          >
            Sign In
          </Button>

          <Text fontSize="sm">
            Don't have an account?{" "}
            <Button
              variant="link"
              colorScheme="blue"
              onClick={() => router.push("/signup")}
            >
              Sign up
            </Button>
          </Text>
        </Stack>
      </form>
    </Box>
  );
}
