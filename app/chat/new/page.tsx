"use client";

import { useEffect, useState } from "react";
import { Box, Spinner, Center, Text } from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import { getCurrentUser } from "@/utils/supabase-client";

export default function NewChatPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  // Generate a new conversation ID and redirect to it
  useEffect(() => {
    const createNewConversation = async () => {
      try {
        // Check if user is authenticated
        const { user } = await getCurrentUser();

        if (user?.id) {
          // User is authenticated, create a conversation in the database
          console.log(
            "Creating new conversation in database for user:",
            user.id
          );

          const response = await fetch("/api/conversations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: "New Conversation",
              userId: user.id,
            }),
          });

          if (response.ok) {
            const data = await response.json();
            if (data.success && data.conversation?.id) {
              console.log(
                "Created new conversation in database with ID:",
                data.conversation.id
              );
              router.push(`/chat/${data.conversation.id}`);
              return;
            } else {
              console.error("Failed to create conversation in database:", data);
              setError(
                "Failed to create conversation. Falling back to local storage."
              );
            }
          } else {
            console.error("Server error:", response.status);
            setError("Server error. Falling back to local storage.");
          }

          // If we're here, the server request failed - fall back to localStorage
        }

        // For anonymous users or if server request failed, create in localStorage
        console.log("Creating new conversation in localStorage");

        // Generate a new conversation ID
        const newId = `conv-${Math.random()
          .toString(36)
          .substring(2, 15)}-${Date.now()}`;

        // Get existing conversations or create empty array
        const storedConversations = localStorage.getItem(
          "mindpulse-conversations"
        );
        let conversations = [];

        if (storedConversations) {
          try {
            conversations = JSON.parse(storedConversations);
          } catch (e) {
            console.error("Error parsing stored conversations:", e);
          }
        }

        // Add new conversation
        const newConversation = {
          id: newId,
          title: "New Conversation",
          history: [],
        };

        conversations = [newConversation, ...conversations];

        // Save to localStorage
        localStorage.setItem(
          "mindpulse-conversations",
          JSON.stringify(conversations)
        );
        localStorage.setItem("mindpulse-active-conversation", newId);

        // Redirect to the new conversation
        router.push(`/chat/${newId}`);
      } catch (e) {
        console.error("Error creating new conversation:", e);
        setError("Something went wrong. Please try again.");
      }
    };

    createNewConversation();
  }, [router]);

  return (
    <Center height="calc(100vh - 200px)" flexDirection="column">
      <Spinner size="xl" />
      <Box mt={4}>Creating new conversation...</Box>
      {error && (
        <Text color="red.500" mt={2}>
          {error}
        </Text>
      )}
    </Center>
  );
}
