import { Box, Text, Flex, Link } from "@chakra-ui/react";
import { useColorMode } from "@/components/ui/color-mode";
import { Message } from "@/types/chat";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import {
  vscDarkPlus,
  okaidia,
} from "react-syntax-highlighter/dist/cjs/styles/prism";
import { useMemo } from "react";

interface MessageItemProps {
  message: Message;
}

export function MessageItem({ message }: MessageItemProps) {
  const { colorMode } = useColorMode();

  const userText = message.user || (message as any).userMessage || "";
  const aiText = message.ai || (message as any).aiResponse || "";

  const aiMarkdownComponents = useMemo(
    () => ({
      code({ node, inline, className, children, ...props }: any) {
        const match = /language-(\w+)/.exec(className || "");
        const language = match ? match[1] : "";
        return !inline && match ? (
          <Box mt={2} mb={2} borderRadius="md" overflow="hidden">
            <SyntaxHighlighter
              style={colorMode === "dark" ? vscDarkPlus : okaidia}
              language={language}
              PreTag="div"
              customStyle={{
                margin: 0,
                borderRadius: "0.5rem",
              }}
              {...props}
            >
              {String(children).replace(/\n$/, "")}
            </SyntaxHighlighter>
          </Box>
        ) : (
          <Text
            as="code"
            bg={
              colorMode === "dark" ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"
            }
            px="0.25em"
            py="0.1em"
            borderRadius="0.25em"
            fontSize="0.9em"
            fontFamily="mono"
          >
            {children}
          </Text>
        );
      },
      p: ({ children }: any) => (
        <Text mb={2} lineHeight="1.6">
          {children}
        </Text>
      ),
      ul: ({ children }: any) => (
        <Box as="ul" mb={2} pl={4}>
          {children}
        </Box>
      ),
      ol: ({ children }: any) => (
        <Box as="ol" mb={2} pl={4}>
          {children}
        </Box>
      ),
      li: ({ children }: any) => (
        <Text as="li" mb={1}>
          {children}
        </Text>
      ),
      h1: ({ children }: any) => (
        <Text as="h1" fontSize="xl" fontWeight="bold" mb={2} mt={2}>
          {children}
        </Text>
      ),
      h2: ({ children }: any) => (
        <Text as="h2" fontSize="lg" fontWeight="bold" mb={2} mt={2}>
          {children}
        </Text>
      ),
      h3: ({ children }: any) => (
        <Text as="h3" fontSize="md" fontWeight="bold" mb={2} mt={2}>
          {children}
        </Text>
      ),
      blockquote: ({ children }: any) => (
        <Box
          as="blockquote"
          borderLeft="3px solid"
          borderColor={colorMode === "dark" ? "gray.600" : "gray.300"}
          pl={3}
          my={2}
          fontStyle="italic"
        >
          {children}
        </Box>
      ),
      a: ({ children, href }: any) => (
        <Link
          href={href}
          color={colorMode === "dark" ? "blue.400" : "blue.600"}
          textDecoration="underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          {children}
        </Link>
      ),
      strong: ({ children }: any) => (
        <Text as="span" fontWeight="bold">
          {children}
        </Text>
      ),
      em: ({ children }: any) => (
        <Text as="span" fontStyle="italic">
          {children}
        </Text>
      ),
      br: () => <Box as="br" />,
    }),
    [colorMode]
  );

  return (
    <>
      {userText && (
        <Flex justifyContent="flex-end" mb={3}>
          <Box
            maxW="70%"
            p={3}
            borderRadius="md"
            bg={colorMode === "dark" ? "gray.800" : "gray.100"}
            border="1px solid"
            borderColor={colorMode === "dark" ? "gray.700" : "gray.200"}
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkBreaks]}
              components={aiMarkdownComponents}
            >
              {userText}
            </ReactMarkdown>
          </Box>
        </Flex>
      )}

      {aiText && (
        <Flex justifyContent="flex-start" mb={3}>
          <Box maxW="70%" p={3}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkBreaks]}
              components={aiMarkdownComponents}
            >
              {aiText}
            </ReactMarkdown>
          </Box>
        </Flex>
      )}
    </>
  );
}
