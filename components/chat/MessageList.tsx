import { Box, Text, Spinner } from "@chakra-ui/react";
import { useColorMode } from "@/components/ui/color-mode";
import { MessageItem } from "./MessageItem";
import { Conversation } from "@/types/chat";

interface MessageListProps {
  conversation: Conversation | null;
  historyLoading: boolean;
  user: any;
  savingToLongTerm: number | null;
  onSaveToMemory: (conversationId: string, messageIndex: number) => void;
  onForgetFromMemory: (conversationId: string, messageIndex: number) => void;
}

export function MessageList({
  conversation,
  historyLoading,
  user,
  savingToLongTerm,
  onSaveToMemory,
  onForgetFromMemory,
}: MessageListProps) {
  const { colorMode } = useColorMode();

  if (historyLoading) {
    return (
      <Box textAlign="center" py={6}>
        <Spinner size="sm" color="blue.400" mb={2} />
        <Text
          fontSize="sm"
          color={colorMode === "dark" ? "gray.400" : "gray.600"}
        >
          Loading conversation...
        </Text>
      </Box>
    );
  }

  if (
    !conversation ||
    !conversation.history ||
    conversation.history.length === 0
  ) {
    return (
      <Box textAlign="center" py={6}>
        <Text
          fontSize="sm"
          color={colorMode === "dark" ? "gray.400" : "gray.600"}
        >
          Start a new conversation below
        </Text>
      </Box>
    );
  }

  return (
    <Box>
      {conversation.history.map((message, index) => (
        <MessageItem
          key={index}
          message={message}
          index={index}
          conversationId={conversation.id}
          user={user}
          savingToLongTerm={savingToLongTerm}
          onSaveToMemory={onSaveToMemory}
          onForgetFromMemory={onForgetFromMemory}
        />
      ))}
    </Box>
  );
}
