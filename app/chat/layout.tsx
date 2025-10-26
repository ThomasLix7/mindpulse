"use client";

import { Box, Flex, Heading, Text } from "@chakra-ui/react";
import { useState, useEffect } from "react";
import { getCurrentUser } from "@/utils/supabase-client";
import ConversationSidebar from "@/components/ConversationSidebar";
import { useRouter, usePathname } from "next/navigation";
import { useColorMode } from "@/components/ui/color-mode";

// Define a type for conversations to fix the typing issue
interface Conversation {
  id: string;
  title: string;
  history?: Array<{ user: string; ai: string }>;
}

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { colorMode } = useColorMode();
  const [user, setUser] = useState<any>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
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

    // Listen for conversation creation events
    const handleNewConversation = (event: any) => {
      setConversations((prev) => {
        // Check if conversation already exists to avoid duplicates
        if (prev.some((conv: any) => conv.id === event.detail.id)) {
          return prev;
        }
        return [event.detail, ...prev];
      });
    };

    // Add event listener for conversation created
    window.addEventListener("conversation-created", handleNewConversation);

    // Cleanup
    return () => {
      window.removeEventListener("conversation-created", handleNewConversation);
    };
  }, []);

  // Handle conversation deletion
  const deleteConversation = async (id: string) => {
    // Get current conversation ID from URL
    const currentConversationId = pathname.split("/").pop();
    const isCurrentConversation = id === currentConversationId;

    // Store conversations before updating state
    const currentConversations = [...conversations];

    // Remove conversation from state immediately for responsive UI
    setConversations((prev) => prev.filter((conv) => conv.id !== id));

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

    // If we deleted the current conversation, redirect to a different page
    if (isCurrentConversation) {
      const remainingConversations = currentConversations.filter(
        (conv) => conv.id !== id
      );

      if (remainingConversations.length > 0) {
        const nextConversation = remainingConversations[0];
        router.push(`/chat/${nextConversation.id}`);
      } else {
        router.push("/chat");
      }
    }
  };

  return (
    <Flex
      position="fixed"
      top="64px"
      left="0"
      right="0"
      bottom="0"
      bg={colorMode === "dark" ? "gray.900" : "white"}
      color={colorMode === "dark" ? "white" : "black"}
      overflow="hidden"
      className="chat-layout-container"
    >
      {/* Persistent Sidebar */}
      <ConversationSidebar
        conversations={conversations}
        isLoading={isLoading}
        userId={user?.id}
        onDeleteConversation={deleteConversation}
      />

      {/* Main Content */}
      <Box flex="1" overflow="auto" h="100%" position="relative">
        <Box padding={0} height="100%" overflowY="auto">
          {children}
        </Box>
      </Box>
    </Flex>
  );
}
