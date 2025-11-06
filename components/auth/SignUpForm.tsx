"use client";

import { useState } from "react";
import { signUp } from "@/utils/supabase-client";
import { Box, Input, Button, Stack, Text, Field } from "@chakra-ui/react";
import { useRouter } from "next/navigation";

export default function SignUpForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await signUp(email, password);

      if (error) {
        throw error;
      }

      setMessage(
        "Registration successful! Please check your email for verification."
      );

      setTimeout(() => {
        router.push("/login");
      }, 3000);
    } catch (error: any) {
      setError(error.message || "Failed to sign up");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box maxW="md" mx="auto" mt={8}>
      <form onSubmit={handleSignUp}>
        <Stack direction="column" gap={4} alignItems="flex-start">
          <Text fontSize="2xl" fontWeight="bold">
            Create an Account
          </Text>

          {error && (
            <Box p={3} bg="red.100" color="red.700" borderRadius="md" w="100%">
              {error}
            </Box>
          )}

          {message && (
            <Box
              p={3}
              bg="green.100"
              color="green.700"
              borderRadius="md"
              w="100%"
            >
              {message}
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
              placeholder="Create a password"
            />
          </Field.Root>

          <Field.Root>
            <Field.Label>Confirm Password</Field.Label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm your password"
            />
          </Field.Root>

          <Button
            type="submit"
            colorScheme="blue"
            width="full"
            isLoading={loading}
          >
            Sign Up
          </Button>

          <Text fontSize="sm">
            Already have an account?{" "}
            <Button
              variant="link"
              colorScheme="blue"
              onClick={() => router.push("/login")}
            >
              Sign in
            </Button>
          </Text>
        </Stack>
      </form>
    </Box>
  );
}
