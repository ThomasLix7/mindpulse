"use client";
import { useState, useEffect } from "react";
import {
  Box,
  Input,
  Button,
  Stack,
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
import { getCurrentUser, signOut } from "@/utils/supabase-client";
import { useRouter } from "next/navigation";

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
  const [historyLoading, setHistoryLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const router = useRouter();

  // Initialize or retrieve user information and session ID
  useEffect(() => {
    const checkAuth = async () => {
      const { user, error } = await getCurrentUser();
      setUser(user);
      setAuthChecked(true);

      // Set up session ID (for non-logged in users)
      let currentSessionId;
      if (!user) {
        const storedSessionId = localStorage.getItem("mindpulse-session-id");
        if (storedSessionId) {
          currentSessionId = storedSessionId;
        } else {
          currentSessionId = generateSessionId();
          localStorage.setItem("mindpulse-session-id", currentSessionId);
        }
      } else {
        // For logged in users, we'll use their user ID directly
        // But we still need a session ID for the API
        currentSessionId = `user-${user.id}`;
      }

      setSessionId(currentSessionId);

      // Fetch chat history from server
      await fetchChatHistory(currentSessionId, user?.id);
    };

    checkAuth();
  }, []);

  // Fetch chat history from server
  const fetchChatHistory = async (sid: string, uid?: string) => {
    setHistoryLoading(true);
    try {
      // User ID validation is now done server-side, but we still log client-side for debugging
      if (uid) {
        console.log(
          `Fetching chat history for user: ${uid} and session: ${sid}`
        );
      } else {
        console.log(`Fetching chat history for anonymous session: ${sid}`);
      }

      const response = await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sid,
          userId: uid,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.history && Array.isArray(data.history)) {
          // Format the history to match our state structure
          const formattedHistory = data.history.map((item: any) => ({
            user: item.userMessage || "",
            ai: item.aiResponse || "",
          }));
          setHistory(formattedHistory);
          console.log(
            `Successfully loaded ${formattedHistory.length} messages from database`
          );
        } else {
          console.warn(
            "History API returned success=false or invalid data format"
          );
          loadFromLocalStorage(uid);
        }
      } else {
        // Handle specific error cases
        try {
          const errorData = await response.json();
          console.error(`Failed to fetch chat history: ${errorData.error}`);
          if (errorData.message) {
            console.warn(`Server message: ${errorData.message}`);
          }
        } catch (e) {
          console.error("Failed to parse error response");
        }

        loadFromLocalStorage(uid);
      }
    } catch (error) {
      console.error("Error fetching chat history:", error);
      loadFromLocalStorage(uid);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Helper function to load from localStorage
  const loadFromLocalStorage = (uid?: string) => {
    // Only try to load from localStorage if no user ID (anonymous users)
    if (!uid) {
      console.log("Falling back to localStorage for chat history");
      const storedHistory = localStorage.getItem("mindpulse-session-history");
      if (storedHistory) {
        try {
          setHistory(JSON.parse(storedHistory));
          console.log("Loaded chat history from localStorage as fallback");
        } catch (e) {
          console.error("Error parsing stored chat history:", e);
        }
      }
    } else {
      console.log(
        "Signed-in user but could not load history from database - using empty history"
      );
    }
  };

  // Only save to localStorage for non-logged in users as a fallback
  useEffect(() => {
    if (history.length > 0 && !user) {
      localStorage.setItem(
        "mindpulse-session-history",
        JSON.stringify(history)
      );
    }
  }, [history, user]);

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
          userId: user?.id, // Include user ID if authenticated
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

  const handleLogout = async () => {
    await signOut();
    setUser(null);
    setHistory([]);

    // Generate a new anonymous session ID
    const newSessionId = generateSessionId();
    localStorage.setItem("mindpulse-session-id", newSessionId);
    setSessionId(newSessionId);

    router.push("/login");
  };

  const handleLogin = () => {
    router.push("/login");
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem("mindpulse-session-history");
  };

  return (
    <Box p={4} maxW="xl" margin="0 auto">
      {/* Authentication Status */}
      <Box
        mb={4}
        display="flex"
        justifyContent="space-between"
        alignItems="center"
      >
        {user ? (
          <Box display="flex" alignItems="center" gap={2}>
            <Text fontSize="sm">Logged in as: {user.email}</Text>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              Sign Out
            </Button>
          </Box>
        ) : authChecked ? (
          <Button variant="outline" size="sm" onClick={handleLogin}>
            Sign In
          </Button>
        ) : null}

        <Button
          variant="outline"
          size="sm"
          colorScheme="red"
          onClick={clearHistory}
          isDisabled={history.length === 0}
        >
          Clear History
        </Button>
      </Box>

      {/* Chat History */}
      {historyLoading ? (
        <Box textAlign="center" my={8}>
          <Text>Loading chat history...</Text>
        </Box>
      ) : (
        <Stack direction="column" gap={4} mb={4}>
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
        </Stack>
      )}

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
