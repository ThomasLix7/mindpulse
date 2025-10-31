import { Box, Input, Button, Text } from "@chakra-ui/react";

interface ChatInputProps {
  input: string;
  setInput: (value: string) => void;
  loading: boolean;
  saveAsLongTerm: boolean;
  setSaveAsLongTerm: (value: boolean) => void;
  enableWebSearch: boolean;
  setEnableWebSearch: (value: boolean) => void;
  user: any;
  onSubmit: (e: React.FormEvent, isLongTerm?: boolean) => void;
}

export function ChatInput({
  input,
  setInput,
  loading,
  saveAsLongTerm,
  setSaveAsLongTerm,
  enableWebSearch,
  setEnableWebSearch,
  user,
  onSubmit,
}: ChatInputProps) {
  return (
    <Box
      position="sticky"
      bottom={0}
      left={0}
      right={0}
      borderTop="1px solid"
      borderColor="gray.700"
      p={4}
      bg="black"
      zIndex={2}
      flexShrink={0}
      minHeight="100px"
    >
      <form onSubmit={(e) => onSubmit(e, saveAsLongTerm)}>
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask me anything..."
          mb={2}
          disabled={loading}
          bg="gray.800"
          color="white"
          border="1px solid"
          borderColor="gray.600"
          _placeholder={{ color: "gray.500" }}
          _hover={{ borderColor: "gray.500" }}
          _focus={{
            borderColor: "blue.400",
            boxShadow: "0 0 0 1px #4299E1",
          }}
        />
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Button
            type="submit"
            colorScheme="blue"
            isLoading={loading}
            bg="blue.600"
            _hover={{ bg: "blue.500" }}
          >
            Send
          </Button>

          <Box display="flex" alignItems="center" gap={4}>
            <Box display="flex" alignItems="center">
              <input
                type="checkbox"
                id="enableWebSearch"
                checked={enableWebSearch}
                onChange={(e) => setEnableWebSearch(e.target.checked)}
              />
              <Text fontSize="sm" ml={2} color="gray.300">
                Enable Web Search
              </Text>
            </Box>

            {user && (
              <Box display="flex" alignItems="center">
                <input
                  type="checkbox"
                  id="saveToLongTerm"
                  checked={saveAsLongTerm}
                  onChange={(e) => setSaveAsLongTerm(e.target.checked)}
                  disabled={!user}
                />
                <Text fontSize="sm" ml={2} color="gray.300">
                  Remember the course
                </Text>
              </Box>
            )}
          </Box>
        </Box>
      </form>
    </Box>
  );
}
