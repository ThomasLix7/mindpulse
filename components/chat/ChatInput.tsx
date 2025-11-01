import { Box, Input, Button, Text } from "@chakra-ui/react";
import { useColorMode } from "@/components/ui/color-mode";

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
  const { colorMode } = useColorMode();
  
  return (
    <Box
      position="sticky"
      bottom={0}
      left={0}
      right={0}
      borderTop="1px solid"
      borderColor={colorMode === "dark" ? "gray.700" : "gray.200"}
      p={4}
      bg={colorMode === "dark" ? "gray.900" : "white"}
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
          bg={colorMode === "dark" ? "gray.800" : "gray.100"}
          color={colorMode === "dark" ? "white" : "black"}
          border="1px solid"
          borderColor={colorMode === "dark" ? "gray.600" : "gray.300"}
          _placeholder={{ color: colorMode === "dark" ? "gray.500" : "gray.400" }}
          _hover={{ borderColor: colorMode === "dark" ? "gray.500" : "gray.400" }}
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
              <Text fontSize="sm" ml={2} color={colorMode === "dark" ? "gray.300" : "gray.700"}>
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
                <Text fontSize="sm" ml={2} color={colorMode === "dark" ? "gray.300" : "gray.700"}>
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
