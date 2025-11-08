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
      p: ({ children }: any) => (
        <Text as="p" mb={4} lineHeight="1.8" fontSize="lg">
          {children}
        </Text>
      ),
      h1: ({ children }: any) => (
        <Text as="h1" fontSize="3xl" fontWeight="bold" mb={4} mt={6}>
          {children}
        </Text>
      ),
      h2: ({ children }: any) => (
        <Text as="h2" fontSize="2xl" fontWeight="bold" mb={3} mt={5}>
          {children}
        </Text>
      ),
      h3: ({ children }: any) => (
        <Text as="h3" fontSize="xl" fontWeight="semibold" mb={3} mt={4}>
          {children}
        </Text>
      ),
      ul: ({ children }: any) => (
        <Box as="ul" pl={6} mb={4}>
          {children}
        </Box>
      ),
      ol: ({ children }: any) => (
        <Box as="ol" pl={6} mb={4}>
          {children}
        </Box>
      ),
      li: ({ children }: any) => {
        const getTextContent = (node: any): string => {
          if (typeof node === "string") return node;
          if (typeof node === "number") return String(node);
          if (Array.isArray(node)) return node.map(getTextContent).join("");
          if (node?.props?.children) return getTextContent(node.props.children);
          return "";
        };

        const text = getTextContent(children);

        const itemMatch = text.match(/^(Item\s+\d+)\s*(\([^)]+\))?\s*:/);
        if (itemMatch) {
          const itemNumber = itemMatch[1];
          const errorType = itemMatch[2] || "";
          const description = text.replace(
            /^Item\s+\d+\s*(\([^)]+\))?\s*:\s*/,
            ""
          );

          return (
            <Box as="li" mb={4} lineHeight="1.8">
              <Flex align="start" gap={2} mb={2} flexWrap="wrap">
                <Box
                  px={3}
                  py={1}
                  borderRadius="md"
                  bg={
                    colorMode === "dark"
                      ? "rgba(37, 99, 235, 0.3)"
                      : "rgba(37, 99, 235, 0.15)"
                  }
                  color={colorMode === "dark" ? "blue.300" : "blue.700"}
                  fontSize="sm"
                  fontWeight="bold"
                >
                  {itemNumber}
                </Box>
                {errorType && (
                  <Box
                    px={3}
                    py={1}
                    borderRadius="md"
                    bg={
                      colorMode === "dark"
                        ? "rgba(239, 68, 68, 0.2)"
                        : "rgba(239, 68, 68, 0.12)"
                    }
                    color={colorMode === "dark" ? "red.400" : "red.600"}
                    fontSize="sm"
                    fontWeight="semibold"
                  >
                    {errorType}
                  </Box>
                )}
              </Flex>
              <Text fontSize="lg" lineHeight="1.8" pl={2}>
                {description}
              </Text>
            </Box>
          );
        }

        const sectionHeaderMatch = text.match(/^([^:]+):\s*$/);
        if (sectionHeaderMatch) {
          return (
            <Box as="li" mb={3} mt={4}>
              <Text
                fontSize="xl"
                fontWeight="bold"
                color={colorMode === "dark" ? "white" : "inherit"}
                mb={2}
              >
                {text}
              </Text>
            </Box>
          );
        }

        const subItemMatch = text.match(/^([^:]+):\s*(.+)$/);
        if (subItemMatch) {
          const label = subItemMatch[1].trim();
          const description = subItemMatch[2].trim();

          return (
            <Box as="li" mb={3} lineHeight="1.8">
              <Flex align="start" gap={2} mb={1}>
                <Box
                  px={3}
                  py={1}
                  borderRadius="md"
                  bg={
                    colorMode === "dark"
                      ? "rgba(147, 51, 234, 0.2)"
                      : "rgba(147, 51, 234, 0.12)"
                  }
                  color={colorMode === "dark" ? "purple.400" : "purple.600"}
                  fontSize="sm"
                  fontWeight="semibold"
                >
                  {label}:
                </Box>
              </Flex>
              <Text fontSize="lg" lineHeight="1.8" pl={2}>
                {description}
              </Text>
            </Box>
          );
        }

        return (
          <Text as="li" mb={2} lineHeight="1.8" fontSize="lg">
            {children}
          </Text>
        );
      },
      code: ({ inline, children, className }: any) => {
        const match = /language-(\w+)/.exec(className || "");
        const language = match ? match[1] : "";
        const codeString = String(children).replace(/\n$/, "");

        if (!inline && language) {
          return (
            <Box my={4}>
              <SyntaxHighlighter
                style={colorMode === "dark" ? vscDarkPlus : okaidia}
                language={language}
                PreTag="div"
              >
                {codeString}
              </SyntaxHighlighter>
            </Box>
          );
        }

        return (
          <Text
            as="code"
            px={2}
            py={1}
            borderRadius="md"
            fontSize="md"
            bg={colorMode === "dark" ? "gray.700" : "gray.100"}
            color={colorMode === "dark" ? "gray.100" : "gray.800"}
          >
            {children}
          </Text>
        );
      },
      pre: ({ children }: any) => <Box as="pre">{children}</Box>,
      blockquote: ({ children }: any) => (
        <Box
          as="blockquote"
          pl={4}
          borderLeft="4px solid"
          borderColor="gray.300"
          my={4}
          fontStyle="italic"
          fontSize="lg"
        >
          {children}
        </Box>
      ),
      strong: ({ children }: any) => (
        <Text as="strong" fontWeight="bold">
          {children}
        </Text>
      ),
      em: ({ children }: any) => (
        <Text as="em" fontStyle="italic">
          {children}
        </Text>
      ),
      a: ({ href, children }: any) => (
        <Link href={href} color="blue.500" textDecoration="underline">
          {children}
        </Link>
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
          <Box
            maxW="70%"
            p={6}
            bg={
              colorMode === "dark"
                ? "rgba(37, 99, 235, 0.15)"
                : "rgba(37, 99, 235, 0.08)"
            }
            borderRadius="md"
            borderWidth="1px"
            borderColor={
              colorMode === "dark"
                ? "rgba(37, 99, 235, 0.3)"
                : "rgba(37, 99, 235, 0.2)"
            }
          >
            <Box lineHeight="1.8" fontSize="lg">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkBreaks]}
                components={aiMarkdownComponents}
              >
                {aiText}
              </ReactMarkdown>
            </Box>
          </Box>
        </Flex>
      )}
    </>
  );
}
