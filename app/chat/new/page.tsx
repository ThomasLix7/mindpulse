"use client";

import { Box } from "@chakra-ui/react";
import Chat from "@/components/Chat";

export default function NewChatPage() {
  // Directly use the Chat component with conversationId="new"
  // This will trigger the Chat component's logic for creating a new conversation
  return (
    <Box padding={4}>
      <Box borderRadius="lg" boxShadow="md">
        <Chat conversationId="new" />
      </Box>
    </Box>
  );
}
