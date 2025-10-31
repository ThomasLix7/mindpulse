"use client";

import { useState, useEffect } from "react";
import {
  Box,
  Heading,
  Text,
  Input,
  Button,
  Stack,
  Flex,
} from "@chakra-ui/react";
import { getCurrentUser } from "@/utils/supabase-client";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";

interface Memory {
  userMessage: string;
  aiResponse: string;
  timestamp: number;
  type: string;
  id?: string;
}

export default function LongTermMemories() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMemories, setLoadingMemories] = useState(false);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState("");
  const [forgettingMemory, setForgettingMemory] = useState<string | null>(null);
  const router = useRouter();

  // Check authentication on load
  useEffect(() => {
    const checkAuth = async () => {
      const { user, error } = await getCurrentUser();
      setUser(user);
      setLoading(false);

      if (user) {
        // Load memories immediately on first load
        loadMemories("all memories");
      }
    };

    checkAuth();
  }, []);

  // Function to load memories
  const loadMemories = async (query = searchQuery) => {
    if (!user?.id) {
      setError("You must be logged in to view long-term memories");
      return;
    }

    setLoadingMemories(true);
    setError("");

    try {
      const response = await fetch(
        `/api/memory?userId=${encodeURIComponent(
          user.id
        )}&query=${encodeURIComponent(query || "all memories")}`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to load memories: ${response.status}`);
      }

      const data = await response.json();

      if (data.success && Array.isArray(data.memories)) {
        setMemories(data.memories);
        `Loaded ${data.memories.length} long-term memories`;
      } else {
        setError(data.error || "No memories found");
        setMemories([]);
      }
    } catch (error) {
      console.error("Error loading memories:", error);
      setError((error as Error).message || "Failed to load memories");
      setMemories([]);
    } finally {
      setLoadingMemories(false);
    }
  };

  // Function to forget a memory
  const forgetMemory = async (memoryId: string) => {
    if (!user?.id || !memoryId) {
      setError("Unable to forget memory: missing user ID or memory ID");
      return;
    }

    setForgettingMemory(memoryId);
    setError("");

    try {
      const response = await fetch(
        `/api/memory?userId=${encodeURIComponent(
          user.id
        )}&memoryId=${encodeURIComponent(memoryId)}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to forget memory: ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        // Remove the forgotten memory from the UI
        setMemories(memories.filter((memory) => memory.id !== memoryId));
      } else {
        setError(data.error || "Failed to forget memory");
      }
    } catch (error) {
      console.error("Error forgetting memory:", error);
      setError((error as Error).message || "Failed to forget memory");
    } finally {
      setForgettingMemory(null);
    }
  };

  // Handle search form submission
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadMemories();
  };

  // Load all memories
  const handleLoadAll = () => {
    setSearchQuery("");
    loadMemories("all memories");
  };

  // Format date from timestamp
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  if (loading) {
    return (
      <Box textAlign="center" p={10} bg="gray.900" minH="100vh" color="white">
        <div className="spinner-grow" role="status"></div>
        <Text mt={4}>Loading...</Text>
      </Box>
    );
  }

  if (!user) {
    return (
      <Box p={6} bg="gray.900" minH="100vh" color="white">
        <Box p={4} bg="yellow.900" borderRadius="md" color="yellow.100">
          <Heading size="md" mb={2}>
            Authentication Required
          </Heading>
          <Text>You need to be logged in to view your long-term memories.</Text>
        </Box>
        <Button mt={4} colorScheme="blue" onClick={() => router.push("/login")}>
          Go to Login
        </Button>
      </Box>
    );
  }

  return (
    <Box
      p={6}
      maxWidth="1000px"
      mx="auto"
      bg="gray.900"
      minH="100vh"
      color="white"
    >
      <Heading mb={6}>Your Long-Term Memories</Heading>
      <Text mb={4}>
        This page shows memories that have been saved to your long-term memory
        storage. These memories persist across all your courses.
      </Text>

      {/* Search form */}
      <Box mb={6}>
        <form onSubmit={handleSearch}>
          <Flex gap={2}>
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search your memories (leave empty to see all memories)"
              flex="1"
              bg="gray.800"
              borderColor="gray.600"
            />
            <Button
              type="submit"
              colorScheme="blue"
              isLoading={loadingMemories}
            >
              Search
            </Button>
            <Button
              onClick={handleLoadAll}
              colorScheme="gray"
              isDisabled={loadingMemories}
            >
              Show All
            </Button>
          </Flex>
        </form>
        <Text fontSize="sm" color="gray.400" mt={1}>
          Tip: Leave the search box empty or click "Show All" to view all your
          saved memories
        </Text>
      </Box>

      {error && (
        <Box p={4} bg="red.900" borderRadius="md" color="red.100" mb={6}>
          <Text>{error}</Text>
        </Box>
      )}

      {loadingMemories ? (
        <Box textAlign="center" p={10}>
          <div className="spinner-grow" role="status"></div>
          <Text mt={2}>Loading memories...</Text>
        </Box>
      ) : memories.length === 0 ? (
        <Box p={4} bg="blue.900" borderRadius="md" color="blue.100">
          <Text>No long-term memories found. This could mean that:</Text>
          <Text mt={2}>
            1. You haven't saved any course exchanges to long-term memory yet.
          </Text>
          <Text>
            2. There might be a technical issue retrieving your memories.
          </Text>
          <Text mt={2}>
            Try clicking "Show All" to see all your memories, or check the
            browser console for errors.
          </Text>
        </Box>
      ) : (
        <Stack direction="column" gap={4}>
          <Text mb={2} fontWeight="bold">
            Found {memories.length} memories{" "}
            {searchQuery ? `matching "${searchQuery}"` : ""}
          </Text>
          {memories.map((memory, index) => (
            <Box
              key={index}
              p={4}
              borderRadius="md"
              boxShadow="md"
              border="1px"
              borderColor="gray.700"
              bg="gray.800"
            >
              <Text fontWeight="bold" color="blue.300" mb={1}>
                You: {memory.userMessage}
              </Text>
              <Box
                bg="gray.700"
                p={3}
                borderRadius="md"
                mb={2}
                color="blue.200"
              >
                <ReactMarkdown>{memory.aiResponse}</ReactMarkdown>
              </Box>
              <Flex justifyContent="space-between" alignItems="center">
                <Text fontSize="sm" color="gray.400">
                  Saved on: {formatDate(memory.timestamp)}
                </Text>
                {memory.id && (
                  <Button
                    size="sm"
                    colorScheme="red"
                    variant="outline"
                    onClick={() => forgetMemory(memory.id as string)}
                    isLoading={forgettingMemory === memory.id}
                    leftIcon={
                      <span role="img" aria-label="forget">
                        🗑️
                      </span>
                    }
                  >
                    Forget
                  </Button>
                )}
              </Flex>
            </Box>
          ))}
        </Stack>
      )}

      <Box mt={6}>
        <Button
          colorScheme="gray"
          onClick={() => router.push("/")}
          variant="outline"
          _hover={{ bg: "gray.700" }}
        >
          Back to Chat
        </Button>
      </Box>
    </Box>
  );
}
