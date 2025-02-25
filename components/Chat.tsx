"use client";
import { useState, useEffect } from "react";
import {
  Box,
  Input,
  Button,
  VStack,
  Text,
  Code,
  Link,
  Table,
  List,
  ListItem,
  Heading,
  Separator,
} from "@chakra-ui/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/cjs/styles/prism";

// Generate a unique session ID for the user
function generateSessionId() {
  return `session-${Math.random().toString(36).substring(2, 15)}-${Date.now()}`;
}

export default function Chat() {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<Array<{ user: string; ai: string }>>(
    []
  );
  const [sessionId, setSessionId] = useState<string>("");
  const [loading, setLoading] = useState(false);

  // Initialize or retrieve session ID from localStorage
  useEffect(() => {
    const storedSessionId = localStorage.getItem("mindpulse-session-id");
    if (storedSessionId) {
      setSessionId(storedSessionId);
    } else {
      const newSessionId = generateSessionId();
      localStorage.setItem("mindpulse-session-id", newSessionId);
      setSessionId(newSessionId);
    }

    // Try to load previous chat history from localStorage
    const storedHistory = localStorage.getItem("mindpulse-chat-history");
    if (storedHistory) {
      try {
        setHistory(JSON.parse(storedHistory));
      } catch (e) {
        console.error("Error parsing stored chat history:", e);
      }
    }
  }, []);

  // Save chat history to localStorage whenever it changes
  useEffect(() => {
    if (history.length > 0) {
      localStorage.setItem("mindpulse-chat-history", JSON.stringify(history));
    }
  }, [history]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const userMessage = input;
    setInput("");
    setHistory((prev) => [...prev, { user: userMessage, ai: "" }]);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          sessionId: sessionId,
        }),
      });

      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let aiResponse = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process character by character
        while (buffer.length > 0) {
          const char = buffer[0];
          buffer = buffer.slice(1);

          // Check if we're at the start of a new SSE event
          if (char === "d" && buffer.startsWith("ata: ")) {
            // Skip past "data: " (5 characters)
            buffer = buffer.slice(5);
            const endIndex = buffer.indexOf("\n\n");
            if (endIndex === -1) continue;

            const jsonStr = buffer.slice(0, endIndex);
            buffer = buffer.slice(endIndex + 2);

            try {
              const data = JSON.parse(jsonStr);
              aiResponse += data.text;
              Promise.resolve().then(() => {
                setHistory((prev) => {
                  const last = prev[prev.length - 1];
                  return [
                    ...prev.slice(0, -1),
                    { user: last.user, ai: aiResponse },
                  ];
                });
              });
            } catch (e) {
              console.error("JSON parse error:", e);
            }
          }
        }
      }
    } catch (e) {
      console.error("Stream error:", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box p={4} maxW="xl" margin="0 auto">
      <VStack gap={4} mb={4}>
        {history.map((entry, i) => (
          <Box key={i} w="100%">
            <Text fontWeight="bold" color="purple.600">
              You: {entry.user}
            </Text>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                div: ({ node, children }) => (
                  <Box p={4} bg="whiteAlpha.100" borderRadius="md" mb={4}>
                    {children}
                  </Box>
                ),
                p({ children }) {
                  return (
                    <Text mb={4} fontSize="md" lineHeight="tall">
                      {children}
                    </Text>
                  );
                },
                h1({ children }) {
                  return (
                    <Heading as="h1" size="xl" mt={6} mb={4}>
                      {children}
                    </Heading>
                  );
                },
                h2({ children }) {
                  return (
                    <Heading as="h2" size="lg" mt={5} mb={3}>
                      {children}
                    </Heading>
                  );
                },
                h3({ children }) {
                  return (
                    <Heading as="h3" size="md" mt={4} mb={2}>
                      {children}
                    </Heading>
                  );
                },
                code({ node, className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || "");
                  const language = match ? match[1] : "typescript";
                  const codeContent = String(children).replace(/\n$/, "");

                  return match ? (
                    <SyntaxHighlighter
                      language={language}
                      style={vscDarkPlus}
                      customStyle={{
                        margin: "8px 0",
                        borderRadius: "6px",
                        fontSize: "14px",
                        padding: "16px",
                      }}
                    >
                      {codeContent}
                    </SyntaxHighlighter>
                  ) : (
                    <code className={className} {...props}>
                      {children}
                    </code>
                  );
                },
                ul({ children }) {
                  return (
                    <List.Root as="ul" ml={6} mb={4}>
                      {children}
                    </List.Root>
                  );
                },
                ol({ children }) {
                  return (
                    <List.Root as="ol" ml={6} mb={4}>
                      {children}
                    </List.Root>
                  );
                },
                li({ children }) {
                  return <List.Item ml={4}>{children}</List.Item>;
                },
                blockquote({ children }) {
                  return (
                    <Box
                      borderLeft="4px"
                      borderColor="blue.200"
                      pl={4}
                      my={4}
                      fontStyle="italic"
                      color="blue.400"
                      bg="whiteAlpha.100"
                      borderRadius="md"
                      p={2}
                    >
                      {children}
                    </Box>
                  );
                },
                a({ href, children }) {
                  return (
                    <Link
                      href={href}
                      color="blue.500"
                      _hover={{ textDecoration: "underline" }}
                    >
                      {children}
                    </Link>
                  );
                },
                table({ children }) {
                  return (
                    <Box overflowX="auto" my={6}>
                      <Table.Root variant="line" size="sm">
                        {children}
                      </Table.Root>
                    </Box>
                  );
                },
                th({ children }) {
                  return (
                    <Box
                      as="th"
                      bg="whiteAlpha.100"
                      p={2}
                      borderBottomWidth="1px"
                      color="gray.100"
                      borderColor="gray.200"
                    >
                      {children}
                    </Box>
                  );
                },
                td({ children }) {
                  return (
                    <Box
                      as="td"
                      p={2}
                      borderBottomWidth="1px"
                      borderColor="gray.100"
                    >
                      {children}
                    </Box>
                  );
                },
                hr() {
                  return <Separator my={6} borderColor="gray.200" />;
                },
              }}
            >
              {entry.ai}
            </ReactMarkdown>
          </Box>
        ))}
      </VStack>
      <form onSubmit={handleSubmit}>
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask me anything..."
          mb={2}
          disabled={loading}
        />
        <Button type="submit" colorScheme="blue" isLoading={loading}>
          Send
        </Button>
      </form>
    </Box>
  );
}
