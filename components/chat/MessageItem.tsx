import { Box, Text, Flex } from "@chakra-ui/react";
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
    <>
      {userText && (
        <Flex justifyContent="flex-end" mb={3}>
          <Box
            maxW="70%"
            p={3}
            borderRadius="xl"
            background="linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
            color="white"
            boxShadow="0 2px 8px rgba(102, 126, 234, 0.3)"
          >
            <Text whiteSpace="pre-wrap">{userText}</Text>
          </Box>
        </Flex>
      )}

      {aiText && (
        <Flex justifyContent="flex-start" mb={3}>
          <Box maxW="70%" p={3}>
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
        </Flex>
      )}
    </>
  );
}
