import { Box, Text } from "@chakra-ui/react";
import { useColorMode } from "@/components/ui/color-mode";
import { Message } from "@/types/chat";

function isLongtermMemory(item: any): boolean {
  return Boolean(
    item.is_longterm === true ||
      item.metadata?.isLongterm === true ||
      item.isLongterm === true
  );
}

interface MessageItemProps {
  message: Message;
  index: number;
  courseId: string;
  user: any;
}

export function MessageItem({
  message,
  index,
  courseId,
  user,
}: MessageItemProps) {
  const { colorMode } = useColorMode();

  // Check for alternative property names that might exist
  const hasUserMessage = "userMessage" in message;
  const hasAiResponse = "aiResponse" in message;

  // Use either the expected property names or alternatives
  const userText: string =
    message.user || (hasUserMessage ? (message as any).userMessage : "");
  const aiText: string =
    message.ai || (hasAiResponse ? (message as any).aiResponse : "");

  return (
    <Box
      mb={0}
      p={3}
      borderRadius="md"
      backgroundColor={
        userText
          ? colorMode === "dark"
            ? "black"
            : "gray.100"
          : colorMode === "dark"
          ? "gray.900"
          : "gray.50"
      }
    >
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="flex-start"
      >
        <Box flex="1">
          {userText && (
            <Text
              fontWeight="bold"
              color={colorMode === "dark" ? "blue.300" : "blue.600"}
              mb={1}
            >
              You:
            </Text>
          )}
          {userText && <Text>{userText}</Text>}

          {aiText && (
            <Text
              fontWeight="bold"
              color={colorMode === "dark" ? "green.300" : "green.600"}
              mt={userText ? 3 : 0}
              mb={1}
            >
              Lex:
            </Text>
          )}
          {aiText && (
            <Box mt={2}>
              <Text whiteSpace="pre-wrap">
                {aiText.split(/(\*\*.*?\*\*)/g).map((part, i) => {
                  if (part.startsWith("**") && part.endsWith("**")) {
                    return (
                      <Text as="span" key={i} fontWeight="bold">
                        {part.slice(2, -2)}
                      </Text>
                    );
                  }
                  return part;
                })}
              </Text>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
