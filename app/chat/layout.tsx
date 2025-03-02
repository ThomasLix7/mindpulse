"use client";

import { Box, Flex, Heading, Text } from "@chakra-ui/react";
import { useState, useEffect } from "react";
import { getCurrentUser } from "@/utils/supabase-client";
import ConversationSidebar from "@/components/ConversationSidebar";

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<any>(null);
  const [conversations, setConversations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load user and conversations
  useEffect(() => {
    async function loadUserAndConversations() {
      const { user } = await getCurrentUser();
      setUser(user);

      if (user?.id) {
        try {
          const response = await fetch(`/api/conversations?userId=${user.id}`, {
            method: "GET",
            headers: { "Content-Type": "application/json" },
          });

          if (response.ok) {
            const data = await response.json();
            if (data.success && data.conversations) {
              setConversations(data.conversations);
            }
          }
        } catch (error) {
          console.error("Error loading conversations:", error);
        }
      } else {
        // For non-logged in users, load from localStorage
        const storedConversations = localStorage.getItem(
          "mindpulse-conversations"
        );
        if (storedConversations) {
          try {
            setConversations(JSON.parse(storedConversations));
          } catch (e) {
            console.error("Error parsing stored conversations:", e);
          }
        }
      }

      setIsLoading(false);
    }

    loadUserAndConversations();
  }, []);

  // Handle conversation deletion
  const deleteConversation = async (id: string) => {
    // Remove conversation from state immediately for responsive UI
    setConversations((prev) => prev.filter((conv: any) => conv.id !== id));

    // For logged-in users, delete on the server
    if (user?.id) {
      try {
        await fetch(`/api/conversations?id=${id}&userId=${user.id}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("Error deleting conversation on server:", error);
      }
    } else {
      // For anonymous users, update localStorage
      const storedConversations = localStorage.getItem(
        "mindpulse-conversations"
      );
      if (storedConversations) {
        try {
          const parsedConversations = JSON.parse(storedConversations);
          const updatedConversations = parsedConversations.filter(
            (conv: any) => conv.id !== id
          );
          localStorage.setItem(
            "mindpulse-conversations",
            JSON.stringify(updatedConversations)
          );
        } catch (e) {
          console.error("Error updating stored conversations:", e);
        }
      }
    }
  };

  return (
    <Flex h="100vh" bg="black" color="white">
      {/* Persistent Sidebar */}
      <ConversationSidebar
        conversations={conversations}
        isLoading={isLoading}
        userId={user?.id}
        onDeleteConversation={deleteConversation}
      />

      {/* Main Content */}
      <Box flex="1" overflow="auto">
        <Box padding={8}>
          <Heading color="white">MindPulse AI Assistant</Heading>
          <Text marginTop={4} marginBottom={8} color="gray.300">
            Conversational AI with contextual memory
          </Text>
          {children}
        </Box>
      </Box>
    </Flex>
  );
}
