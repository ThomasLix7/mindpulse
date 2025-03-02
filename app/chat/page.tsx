"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Heading, Text, Button, VStack, Flex } from "@chakra-ui/react";
import { getCurrentUser } from "@/utils/supabase-client";

interface Conversation {
  id: string;
  title: string;
  history: Array<{ user: string; ai: string }>;
}

export default function ChatDefaultPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const router = useRouter();

  // Load conversations based on authentication status
  useEffect(() => {
    const loadConversations = async () => {
      setIsLoading(true);

      // Check authentication status
      const { user: currentUser } = await getCurrentUser();
      setUser(currentUser);

      if (currentUser?.id) {
        // User is authenticated, load from the database
        console.log(
          "Loading conversations from database for user:",
          currentUser.id
        );
        await fetchConversationsFromServer(currentUser.id);
      } else {
        // User is not authenticated, load from localStorage
        console.log("Loading conversations from localStorage (anonymous user)");
        loadConversationsFromLocalStorage();
      }

      setIsLoading(false);
    };

    loadConversations();
  }, []);

  // Fetch conversations from server for logged-in users
  const fetchConversationsFromServer = async (userId: string) => {
    try {
      // Get conversations list from server
      const response = await fetch(`/api/conversations?userId=${userId}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (response.ok) {
        const data = await response.json();
        console.log("Server returned conversations:", data);

        if (
          data.success &&
          data.conversations &&
          Array.isArray(data.conversations)
        ) {
          setConversations(data.conversations);
          console.log(
            `Loaded ${data.conversations.length} conversations from server`
          );
        }
      } else {
        console.error("Server error:", response.status);
        // Fallback to localStorage if server fails
        loadConversationsFromLocalStorage();
      }
    } catch (error) {
      console.error("Error fetching conversations from server:", error);
      // Fallback to localStorage if server fails
      loadConversationsFromLocalStorage();
    }
  };

  // Load conversations from localStorage (for anonymous users)
  const loadConversationsFromLocalStorage = () => {
    const storedConversations = localStorage.getItem("mindpulse-conversations");

    if (storedConversations) {
      try {
        const parsedConversations = JSON.parse(storedConversations);
        setConversations(parsedConversations);
        console.log(
          `Loaded ${parsedConversations.length} conversations from localStorage`
        );
      } catch (e) {
        console.error("Error parsing stored conversations:", e);
      }
    }
  };

  // Create new conversation
  const createNewConversation = () => {
    router.push("/chat/new");
  };

  return (
    <Box padding={6}>
      <Heading size="lg" mb={6} color="white">
        All Conversations
      </Heading>

      <Button
        colorScheme="blue"
        mb={6}
        onClick={createNewConversation}
        bg="blue.600"
        _hover={{ bg: "blue.500" }}
      >
        Start New Conversation
      </Button>

      {isLoading ? (
        <Text color="gray.300">Loading conversations...</Text>
      ) : conversations.length === 0 ? (
        <Text color="gray.300">No conversations found. Start a new one!</Text>
      ) : (
        <VStack align="stretch" gap={3}>
          {conversations.map((conversation) => (
            <Flex
              key={conversation.id}
              p={4}
              borderWidth="1px"
              borderRadius="md"
              borderColor="gray.700"
              alignItems="center"
              justifyContent="space-between"
              cursor="pointer"
              bg="gray.900"
              _hover={{ bg: "gray.800" }}
              onClick={() => router.push(`/chat/${conversation.id}`)}
            >
              <Text color="gray.200">{conversation.title}</Text>
              <Text color="gray.400" fontSize="sm">
                Click to open
              </Text>
            </Flex>
          ))}
        </VStack>
      )}
    </Box>
  );
}
