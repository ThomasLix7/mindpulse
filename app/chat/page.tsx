"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Heading, Text, Button, VStack } from "@chakra-ui/react";
import { getCurrentUser } from "@/utils/supabase-client";
import { useColorMode } from "@/components/ui/color-mode";

export default function ChatDefaultPage() {
  const { colorMode } = useColorMode();
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const router = useRouter();

  // Check authentication status
  useEffect(() => {
    const checkAuth = async () => {
      const { user: currentUser } = await getCurrentUser();
      setUser(currentUser);

      // Redirect to login if not authenticated
      if (!currentUser?.id) {
        router.push("/login");
        return;
      }

      setIsLoading(false);
    };

    checkAuth();
  }, [router]);

  // Create new conversation
  const createNewConversation = () => {
    router.push("/chat/new");
  };

  return (
    <Box h="100%" p={8} className="chat-page-container">
      <VStack gap={8} align="center" justify="center" h="100%">
        <VStack gap={4} align="center">
          <Heading
            size="2xl"
            fontWeight="bold"
            color={colorMode === "dark" ? "white" : "black"}
            textAlign="center"
          >
            Welcome to MindPulse
          </Heading>

          <Text
            fontSize="lg"
            color="gray.500"
            textAlign="center"
            maxW="lg"
            lineHeight="tall"
          >
            Your AI tutor is waiting. Let's start a conversation.
          </Text>
        </VStack>

        <Button
          colorScheme="blue"
          onClick={createNewConversation}
          size="lg"
          px={8}
          py={6}
          fontSize="lg"
          fontWeight="semibold"
          borderRadius="xl"
          _hover={{
            transform: "translateY(-2px)",
            boxShadow: "lg",
          }}
          transition="all 0.2s"
        >
          Start New Conversation
        </Button>

        {isLoading && <Text color="gray.400">Loading...</Text>}
      </VStack>
    </Box>
  );
}
