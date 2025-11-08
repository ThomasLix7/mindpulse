import { Box, Textarea, Button, Text } from "@chakra-ui/react";
import { useColorMode } from "@/components/ui/color-mode";
import { useRef, useCallback, useState, useEffect } from "react";

interface ChatInputProps {
  input: string;
  setInput: (value: string) => void;
  loading: boolean;
  enableWebSearch: boolean;
  setEnableWebSearch: (value: boolean) => void;
  onSubmit: (e: React.FormEvent, message?: string) => void;
}

export function ChatInput({
  input,
  setInput,
  loading,
  enableWebSearch,
  setEnableWebSearch,
  onSubmit,
}: ChatInputProps) {
  const { colorMode } = useColorMode();
  const rafRef = useRef<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [localInput, setLocalInput] = useState(input);

  useEffect(() => {
    setLocalInput(input);
  }, [input]);

  useEffect(() => {
    if (!loading && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [loading]);

  const adjustHeight = useCallback((target: HTMLTextAreaElement) => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }
    rafRef.current = requestAnimationFrame(() => {
      if (target) {
        target.style.height = "auto";
        void target.offsetHeight;
        const scrollHeight = target.scrollHeight;
        const maxHeight = 200;
        const newHeight = Math.min(scrollHeight, maxHeight);
        target.style.height = `${newHeight}px`;
        target.style.overflowY = scrollHeight > maxHeight ? "auto" : "hidden";
      }
    });
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = localInput.trim();
      if (!trimmed || loading) return;
      setInput(trimmed);
      onSubmit(e, trimmed);
      setLocalInput("");
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 0);
    },
    [localInput, loading, setInput, onSubmit]
  );

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
      <form onSubmit={handleSubmit}>
        <Textarea
          ref={textareaRef}
          value={localInput}
          onChange={(e) => {
            setLocalInput(e.target.value);
            adjustHeight(e.target);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !loading) {
              e.preventDefault();
              const form = e.currentTarget.form;
              if (form) {
                form.requestSubmit();
              }
            }
          }}
          placeholder="Ask me anything... (Shift+Enter for new line)"
          mb={2}
          disabled={loading}
          bg={colorMode === "dark" ? "gray.800" : "gray.100"}
          color={colorMode === "dark" ? "white" : "black"}
          border="1px solid"
          borderColor={colorMode === "dark" ? "gray.600" : "gray.300"}
          _placeholder={{
            color: colorMode === "dark" ? "gray.500" : "gray.400",
          }}
          _hover={{
            borderColor: colorMode === "dark" ? "gray.500" : "gray.400",
          }}
          _focus={{
            borderColor: "blue.400",
            boxShadow: "0 0 0 1px #4299E1",
          }}
          resize="none"
          minH="60px"
          maxH="200px"
          style={{
            height: "auto",
            lineHeight: "1.5",
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

          <Box display="flex" alignItems="center">
            <input
              type="checkbox"
              id="enableWebSearch"
              checked={enableWebSearch}
              onChange={(e) => setEnableWebSearch(e.target.checked)}
            />
            <Text
              fontSize="sm"
              ml={2}
              color={colorMode === "dark" ? "gray.300" : "gray.700"}
            >
              Enable Web Search
            </Text>
          </Box>
        </Box>
      </form>
    </Box>
  );
}
