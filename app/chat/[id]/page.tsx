"use client";

import { Box } from "@chakra-ui/react";
import Chat from "@/components/Chat";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function ChatPage() {
  const params = useParams();
  const conversationId = params.id as string;
  const [isLoading, setIsLoading] = useState(true);

  // Set loading state and log for debugging
  useEffect(() => {
    if (conversationId) {
      console.log(`ChatPage: Loading conversation with ID: ${conversationId}`);

      // Handle "new" as a special case
      if (conversationId === "new") {
        console.log("ChatPage: This is a new conversation page");
        // We don't need to do anything special here - the Chat component will handle
        // creating a new conversation when conversationId is "new"
      } else {
        console.log("ChatPage: This is an existing conversation");
      }

      setIsLoading(false);
    }
  }, [conversationId]);

  if (isLoading) {
    return <Box padding={8}>Loading conversation...</Box>;
  }

  // The key prop forces the Chat component to re-mount when the conversation ID changes
  // This prevents any state confusion when navigating between different conversations
  return (
    <Box padding={4}>
      <Box borderRadius="lg" boxShadow="md">
        <Chat key={conversationId} conversationId={conversationId} />
      </Box>
    </Box>
  );
}
