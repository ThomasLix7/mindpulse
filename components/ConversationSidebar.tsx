"use client";

import { Box, Button, Text, Stack, Spinner } from "@chakra-ui/react";
import { useRouter, usePathname } from "next/navigation";
import { useColorMode } from "@/components/ui/color-mode";
import { supabase } from "@/utils/supabase-client";
import { apiFetch } from "@/utils/api-fetch";

interface ConversationSidebarProps {
  conversations: any[];
  isLoading: boolean;
  userId?: string;
  onDeleteConversation?: (id: string) => Promise<void>;
}

export default function ConversationSidebar({
  conversations,
  isLoading,
  userId,
  onDeleteConversation,
}: ConversationSidebarProps) {
  const { colorMode } = useColorMode();
  const router = useRouter();
  const pathname = usePathname();
  const currentConversationId = pathname?.split("/").pop();

  const navigateToConversation = (id: string) => {
    if (id === currentConversationId) {
      ("Already on this conversation, not navigating");
      return;
    }

    `Navigating to conversation: ${id}`;
    router.push(`/chat/${id}`);
  };

  const createNewConversation = async () => {
    if (!userId) return;

    try {
      // Get user's access token
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;

      if (!accessToken) {
        console.error("No access token available");
        return;
      }

      const response = await apiFetch("/api/conversations", {
        method: "POST",
        body: JSON.stringify({
          userId: userId,
          title: "New Conversation",
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.conversation) {
          // Navigate directly to the new conversation
          router.push(`/chat/${data.conversation.id}`);
        }
      } else {
        console.error("Failed to create conversation");
      }
    } catch (error) {
      console.error("Error creating conversation:", error);
    }
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (onDeleteConversation) {
      onDeleteConversation(id);
    }
  };

  return (
    <Box
      w="250px"
      borderRight="1px solid"
      borderColor="gray.700"
      p={3}
      display={{ base: "none", md: "block" }}
      bg={colorMode === "dark" ? "gray.900" : "gray.50"}
      h="100%"
      overflow="hidden"
      position="relative"
    >
      <Stack h="100%" gap={3} display="flex" flexDirection="column">
        {/* Sidebar Header */}
        <Text
          fontSize="sm"
          fontWeight="bold"
          color={colorMode === "dark" ? "gray.400" : "gray.600"}
          mb={2}
        >
          CONVERSATIONS
        </Text>

        {/* Conversations List */}
        {isLoading ? (
          <Box textAlign="center" py={8}>
            <Spinner size="sm" color="blue.400" />
            <Text
              mt={2}
              fontSize="sm"
              color={colorMode === "dark" ? "gray.400" : "gray.600"}
            >
              Loading conversations...
            </Text>
          </Box>
        ) : conversations.length === 0 ? (
          <Box textAlign="center" py={8}>
            <Text
              fontSize="sm"
              color={colorMode === "dark" ? "gray.400" : "gray.600"}
            >
              No conversations yet
            </Text>
          </Box>
        ) : (
          <Box overflowY="auto" flex="1">
            <Stack gap={1}>
              {conversations.map((conv: any) => (
                <Box
                  key={conv.id}
                  p={2}
                  cursor="pointer"
                  borderRadius="md"
                  bg={
                    conv.id === currentConversationId
                      ? "gray.800"
                      : "transparent"
                  }
                  _hover={{
                    bg:
                      conv.id !== currentConversationId
                        ? "gray.800"
                        : "gray.700",
                  }}
                  onClick={() => navigateToConversation(conv.id)}
                >
                  <Box
                    display="flex"
                    justifyContent="space-between"
                    alignItems="center"
                  >
                    <Text
                      fontSize="sm"
                      fontWeight={
                        conv.id === currentConversationId ? "bold" : "normal"
                      }
                      color={
                        conv.id === currentConversationId
                          ? "blue.300"
                          : "gray.300"
                      }
                      overflow="hidden"
                      textOverflow="ellipsis"
                      whiteSpace="nowrap"
                      flex="1"
                    >
                      {conv.title || "New Conversation"}
                    </Text>
                    <Box
                      as="span"
                      fontSize="sm"
                      ml={2}
                      color="gray.500"
                      _hover={{ color: "red.400" }}
                      cursor="pointer"
                      onClick={(e) => handleDelete(e, conv.id)}
                    >
                      ×
                    </Box>
                  </Box>
                </Box>
              ))}
            </Stack>
          </Box>
        )}

        {/* New Conversation Button */}
        <Button
          colorScheme="blue"
          size="sm"
          leftIcon={<Box as="span">+</Box>}
          onClick={createNewConversation}
          mt="auto"
          bg="blue.600"
          _hover={{ bg: "blue.500" }}
        >
          New Conversation
        </Button>
      </Stack>
    </Box>
  );
}
