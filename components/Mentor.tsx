"use client";
import { useRef, useEffect } from "react";
import { Box, Button, Flex } from "@chakra-ui/react";
import { useRouter } from "next/navigation";

// Custom hooks
import { useConversations } from "@/hooks/useConversations";
import { useMemory } from "@/hooks/useMemory";
import { useChat } from "@/hooks/useChat";

// Components
import { ChatHeader } from "@/components/chat/ChatHeader";
import { MessageList } from "@/components/chat/MessageList";
import { ChatInput } from "@/components/chat/ChatInput";

// Types
import { ChatProps } from "@/types/chat";

export default function ChatRefactored({
  conversationId,
  isHomePage = false,
}: ChatProps) {
  const router = useRouter();

  // Auto-scroll ref
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Custom hooks
  const {
    conversations,
    setConversations,
    activeConversationId,
    historyLoading,
    user,
    authChecked,
    getActiveConversation,
    createNewConversation,
    renameConversation,
    clearConversation,
  } = useConversations(conversationId, isHomePage);

  const { savingToLongTerm, forgetFromLongTermMemory, saveToLongTermMemory } =
    useMemory({
      conversations,
      setConversations,
      user,
    });

  const {
    input,
    setInput,
    loading,
    saveAsLongTerm,
    setSaveAsLongTerm,
    enableWebSearch,
    setEnableWebSearch,
    handleSubmit,
  } = useChat({
    conversations,
    setConversations,
    activeConversationId,
    user,
    createNewConversation,
    updateConversationHistory: (id, userMessage, aiResponse) => {
      setConversations((prev) =>
        prev.map((conv) => {
          if (conv.id === id) {
            let updatedTitle = conv.title;
            if (conv.history.length === 0 && userMessage.length > 0) {
              updatedTitle =
                userMessage.substring(0, 30) +
                (userMessage.length > 30 ? "..." : "");
            }
            return {
              ...conv,
              title: updatedTitle,
              history: [...conv.history, { user: userMessage, ai: aiResponse }],
            };
          }
          return conv;
        })
      );
    },
    updateStreamingResponse: (id, aiResponse) => {
      setConversations((prev) =>
        prev.map((conv) => {
          if (conv.id === id && conv.history.length > 0) {
            const updatedHistory = [...conv.history];
            const lastIndex = updatedHistory.length - 1;
            updatedHistory[lastIndex] = {
              user: updatedHistory[lastIndex].user,
              ai: aiResponse,
            };
            return { ...conv, history: updatedHistory };
          }
          return conv;
        })
      );
    },
    renameConversation,
    getActiveConversation,
    isHomePage,
  });

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    const activeConvo = getActiveConversation();
    if (chatContainerRef.current && activeConvo.history?.length > 0) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, [conversations, activeConversationId, getActiveConversation]);

  const activeConversation = getActiveConversation();

  return (
    <Flex
      h="92vh"
      maxH="100vh"
      flexDirection="column"
      bg="black"
      color="white"
      overflow="hidden"
      position="absolute"
      bottom={0}
      left={0}
      right={0}
    >
      {/* Chat Header */}
      <ChatHeader
        title={activeConversation.title}
        onTitleUpdate={(newTitle) =>
          renameConversation(activeConversationId, newTitle)
        }
        onClearChat={clearConversation}
        hasHistory={activeConversation.history?.length > 0}
      />

      {/* Chat Content */}
      <Box
        position="relative"
        flex="1"
        overflowY="auto"
        overflowX="hidden"
        ref={chatContainerRef}
        minHeight={0}
      >
        {/* Mobile-only Chat Controls */}
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Button
            variant="outline"
            size="sm"
            colorScheme="blue"
            onClick={() => router.push("/chat/new")}
            display={{ base: "inline-flex", md: "none" }}
            borderColor="gray.600"
            color="gray.200"
            _hover={{ bg: "gray.800" }}
          >
            New
          </Button>
        </Box>

        {/* Messages */}
        <Box px={4} pb={4}>
          <MessageList
            conversation={activeConversation}
            historyLoading={historyLoading}
            user={user}
            savingToLongTerm={savingToLongTerm}
            onSaveToMemory={saveToLongTermMemory}
            onForgetFromMemory={forgetFromLongTermMemory}
          />
        </Box>
      </Box>

      {/* Chat Input */}
      <ChatInput
        input={input}
        setInput={setInput}
        loading={loading}
        saveAsLongTerm={saveAsLongTerm}
        setSaveAsLongTerm={setSaveAsLongTerm}
        enableWebSearch={enableWebSearch}
        setEnableWebSearch={setEnableWebSearch}
        user={user}
        onSubmit={handleSubmit}
      />
    </Flex>
  );
}
