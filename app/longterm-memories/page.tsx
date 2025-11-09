"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Box,
  Heading,
  Text,
  Input,
  Button,
  Stack,
  Flex,
} from "@chakra-ui/react";
import { getCurrentUser, supabase } from "@/utils/supabase-client";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";

interface Memory {
  userMessage?: string;
  aiResponse?: string;
  content?: string;
  timestamp: number;
  type?: string;
  memoryType?: string | null;
  id?: string;
}

export default function LongTermMemories() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMemories, setLoadingMemories] = useState(false);
  const [allMemories, setAllMemories] = useState<Memory[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [forgettingMemory, setForgettingMemory] = useState<string | null>(null);
  const router = useRouter();

  const availableTypes = useMemo(() => {
    const types = new Set<string>();
    allMemories.forEach((memory) => {
      if (memory.memoryType) {
        types.add(memory.memoryType);
      } else {
        types.add("conversation");
      }
    });
    return Array.from(types).sort();
  }, [allMemories]);

  const filteredMemories = useMemo(() => {
    let filtered = allMemories;

    if (selectedType) {
      if (selectedType === "conversation") {
        filtered = filtered.filter((memory) => !memory.memoryType);
      } else {
        filtered = filtered.filter(
          (memory) => memory.memoryType === selectedType
        );
      }
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((memory) => {
        if (memory.userMessage?.toLowerCase().includes(query)) return true;
        if (memory.aiResponse?.toLowerCase().includes(query)) return true;
        if (memory.content?.toLowerCase().includes(query)) return true;
        if (memory.memoryType?.toLowerCase().includes(query)) return true;
        return false;
      });
    }

    return filtered;
  }, [allMemories, searchQuery, selectedType]);

  const loadMemories = async (query = searchQuery, userId?: string) => {
    const targetUserId = userId || user?.id;
    if (!targetUserId) {
      setError("You must be logged in to view long-term memories");
      return;
    }

    if (allMemories.length > 0 || loadingMemories) {
      return;
    }

    setLoadingMemories(true);
    setError("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;

      if (!accessToken) {
        setError("Authentication required");
        setLoadingMemories(false);
        return;
      }

      const response = await fetch(
        `/api/memory?userId=${encodeURIComponent(targetUserId)}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to load memories: ${response.status}`);
      }

      const data = await response.json();

      if (data.success && Array.isArray(data.memories)) {
        setAllMemories(data.memories);
      } else {
        setError(data.error || "No memories found");
        setAllMemories([]);
      }
    } catch (error) {
      console.error("Error loading memories:", error);
      setError((error as Error).message || "Failed to load memories");
      setAllMemories([]);
    } finally {
      setLoadingMemories(false);
    }
  };

  useEffect(() => {
    const checkAuth = async () => {
      const { user: currentUser, error } = await getCurrentUser();

      if (error) {
        console.error("Auth check error:", error);
      }

      setUser(currentUser);
      setLoading(false);

      if (!currentUser?.id) {
        router.push("/login");
        return;
      }

      loadMemories("all memories", currentUser.id);
    };

    checkAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        setUser(null);
        setAllMemories([]);
        router.push("/login");
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const forgetMemory = async (memoryId: string) => {
    if (!user?.id || !memoryId) {
      setError("Unable to forget memory: missing user ID or memory ID");
      return;
    }

    setForgettingMemory(memoryId);
    setError("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;

      if (!accessToken) {
        setError("Authentication required");
        setForgettingMemory(null);
        return;
      }

      const response = await fetch(
        `/api/memory?userId=${encodeURIComponent(
          user.id
        )}&memoryId=${encodeURIComponent(memoryId)}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to forget memory: ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        setAllMemories(allMemories.filter((memory) => memory.id !== memoryId));
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

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // Search is now client-side, no API call needed
  };

  const handleLoadAll = () => {
    setSearchQuery("");
    setSelectedType(null);
  };

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

      {/* Search form */}
      <Box mb={6}>
        <form onSubmit={handleSearch}>
          <Flex gap={2} mb={3}>
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

        {/* Type filters */}
        {availableTypes.length > 0 && (
          <Flex gap={2} flexWrap="wrap" mb={2}>
            <Button
              size="sm"
              variant={selectedType === null ? "solid" : "outline"}
              colorScheme={selectedType === null ? "blue" : "gray"}
              onClick={() => setSelectedType(null)}
            >
              All Types
            </Button>
            {availableTypes.map((type) => (
              <Button
                key={type}
                size="sm"
                variant={selectedType === type ? "solid" : "outline"}
                colorScheme={selectedType === type ? "purple" : "gray"}
                onClick={() => setSelectedType(type)}
                textTransform="capitalize"
              >
                {type.replace("_", " ")}
              </Button>
            ))}
          </Flex>
        )}
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
      ) : filteredMemories.length === 0 ? (
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
            Found {filteredMemories.length}{" "}
            {searchQuery ? `matching "${searchQuery}"` : ""} memories
            {searchQuery &&
              allMemories.length > filteredMemories.length &&
              ` (out of ${allMemories.length} total)`}
          </Text>
          {filteredMemories.map((memory, index) => (
            <Box
              key={memory.id || index}
              p={4}
              borderRadius="md"
              boxShadow="md"
              border="1px"
              borderColor="gray.700"
              bg="gray.800"
            >
              {memory.memoryType ? (
                // Learning Insight
                <>
                  <Flex align="center" gap={2} mb={2}>
                    <Text
                      px={3}
                      py={1}
                      borderRadius="md"
                      bg="rgba(147, 51, 234, 0.2)"
                      color="purple.300"
                      fontSize="sm"
                      fontWeight="semibold"
                      textTransform="capitalize"
                    >
                      {memory.memoryType.replace("_", " ")}
                    </Text>
                  </Flex>
                  <Box
                    bg="gray.700"
                    p={3}
                    borderRadius="md"
                    mb={2}
                    color="blue.200"
                  >
                    <ReactMarkdown>{memory.content}</ReactMarkdown>
                  </Box>
                </>
              ) : memory.userMessage && memory.aiResponse ? (
                // Conversation Memory
                <>
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
                </>
              ) : (
                // Fallback: Content-only
                <Box
                  bg="gray.700"
                  p={3}
                  borderRadius="md"
                  mb={2}
                  color="blue.200"
                >
                  <ReactMarkdown>{memory.content}</ReactMarkdown>
                </Box>
              )}
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
