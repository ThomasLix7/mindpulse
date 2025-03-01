"use client";
import { useState, useEffect, useRef } from "react";
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
  Flex,
} from "@chakra-ui/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/cjs/styles/prism";
import { getCurrentUser, signOut } from "@/utils/supabase-client";
import { useRouter } from "next/navigation";

// Generate a unique conversation ID for local storage
function generateConversationId() {
  return `conv-${Math.random().toString(36).substring(2, 15)}-${Date.now()}`;
}

// Interface for conversation
interface Conversation {
  id: string;
  title: string;
  history: Array<{ user: string; ai: string }>;
}

export default function Chat() {
  const [input, setInput] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [savingToLongTerm, setSavingToLongTerm] = useState<number | null>(null);
  const [saveAsLongTerm, setSaveAsLongTerm] = useState(false);
  const [enableWebSearch, setEnableWebSearch] = useState<boolean>(false);
  const router = useRouter();
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Helper to get active conversation
  const getActiveConversation = () => {
    return (
      conversations.find((conv) => conv.id === activeConversationId) || {
        id: "",
        title: "",
        history: [],
      }
    );
  };

  // Initialize or retrieve user information and conversations
  useEffect(() => {
    const checkAuth = async () => {
      const { user, error } = await getCurrentUser();
      setUser(user);
      setAuthChecked(true);

      // Load saved conversations from localStorage (for anonymous users)
      // or from server (for logged-in users)
      await loadConversations(user?.id);
    };

    checkAuth();
  }, []);

  // Load conversations from localStorage or server
  const loadConversations = async (userId?: string) => {
    setHistoryLoading(true);

    // Add a timeout to ensure loading state doesn't get stuck
    const timeout = setTimeout(() => {
      console.log("Conversation loading timed out, fallback to localStorage");
      setHistoryLoading(false);
      loadConversationsFromLocalStorage();
    }, 10000); // 10 second timeout

    try {
      if (userId) {
        // Fetch conversations from server for logged-in user
        await fetchConversationsFromServer(userId);
      } else {
        // Load from localStorage for anonymous users
        loadConversationsFromLocalStorage();
      }
    } catch (error) {
      console.error("Error loading conversations:", error);
      // Fallback to localStorage if server fails
      loadConversationsFromLocalStorage();
    } finally {
      clearTimeout(timeout);
      setHistoryLoading(false);
    }
  };

  // Fetch conversations from server for logged-in users
  const fetchConversationsFromServer = async (userId: string) => {
    try {
      // Get conversations list from server with history included
      const response = await fetch(
        `/api/conversations?userId=${userId}&includeHistory=true`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        }
      );

      if (response.ok) {
        const data = await response.json();
        console.log("API response data:", data);

        if (
          data.success &&
          data.conversations &&
          Array.isArray(data.conversations)
        ) {
          // Convert server data format to client format
          const clientConversations = data.conversations.map((conv: any) => {
            // Format history from the already included data
            const history = (conv.history || []).map((item: any) => ({
              user: item.userMessage,
              ai: item.aiResponse,
            }));

            return {
              id: conv.id,
              title: conv.title,
              history,
            };
          });

          console.log(`Setting ${clientConversations.length} conversations`);
          setConversations(clientConversations);

          // Set active conversation to the most recent one
          if (clientConversations.length > 0) {
            console.log(
              "Setting active conversation to:",
              clientConversations[0].id
            );
            setActiveConversationId(clientConversations[0].id);
          } else {
            console.log("No conversations found, creating new one");
            // Create a new conversation if none exist
            createNewConversation();
          }

          console.log(
            `Successfully loaded ${clientConversations.length} conversations from server`
          );
        } else {
          console.warn(
            "API returned success=false or invalid data format:",
            data
          );
          createNewConversation();
        }
      } else {
        console.error(
          "Failed to fetch conversations from server with status:",
          response.status
        );
        try {
          const errorData = await response.json();
          console.error("Error details:", errorData);
        } catch (e) {
          console.error("Couldn't parse error response");
        }
        createNewConversation();
      }
    } catch (error) {
      console.error("Error fetching conversations:", error);
      createNewConversation();
    }
  };

  // Load conversations from localStorage (for anonymous users)
  const loadConversationsFromLocalStorage = () => {
    const storedConversations = localStorage.getItem("mindpulse-conversations");
    const storedActiveConversation = localStorage.getItem(
      "mindpulse-active-conversation"
    );

    if (storedConversations) {
      try {
        const parsedConversations = JSON.parse(storedConversations);
        setConversations(parsedConversations);

        // Set active conversation
        if (
          storedActiveConversation &&
          parsedConversations.some(
            (c: Conversation) => c.id === storedActiveConversation
          )
        ) {
          setActiveConversationId(storedActiveConversation);
        } else if (parsedConversations.length > 0) {
          setActiveConversationId(parsedConversations[0].id);
        } else {
          createNewConversation();
        }

        console.log(
          `Loaded ${parsedConversations.length} conversations from localStorage`
        );
      } catch (e) {
        console.error("Error parsing stored conversations:", e);
        createNewConversation();
      }
    } else {
      // Create first conversation if none exist
      createNewConversation();
    }
  };

  // Save conversations to localStorage (for anonymous users)
  useEffect(() => {
    if (conversations.length > 0 && !user) {
      localStorage.setItem(
        "mindpulse-conversations",
        JSON.stringify(conversations)
      );
      localStorage.setItem(
        "mindpulse-active-conversation",
        activeConversationId
      );
    }
  }, [conversations, activeConversationId, user]);

  // Create a new conversation
  const createNewConversation = async () => {
    let newConversationId: string;
    const defaultTitle = "New Conversation";

    // For logged-in users, create the conversation on the server
    if (user?.id) {
      try {
        const serverResponse = await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user.id,
            title: defaultTitle,
          }),
        });

        if (serverResponse.ok) {
          const data = await serverResponse.json();
          if (data.success && data.conversation) {
            const newConversation = {
              id: data.conversation.id,
              title: data.conversation.title,
              history: [],
            };

            setConversations((prev) => [newConversation, ...prev]);
            setActiveConversationId(data.conversation.id);
            return data.conversation.id;
          } else {
            // Fallback to client-side ID if server creation fails
            newConversationId = generateConversationId();
            createLocalConversation(newConversationId, defaultTitle);
            return newConversationId;
          }
        } else {
          // Fallback to client-side ID if server creation fails
          newConversationId = generateConversationId();
          createLocalConversation(newConversationId, defaultTitle);
          return newConversationId;
        }
      } catch (error) {
        console.error("Error creating conversation on server:", error);
        newConversationId = generateConversationId();
        createLocalConversation(newConversationId, defaultTitle);
        return newConversationId;
      }
    } else {
      // For anonymous users, just create locally
      newConversationId = generateConversationId();
      createLocalConversation(newConversationId, defaultTitle);
      return newConversationId;
    }
  };

  // Create conversation locally
  const createLocalConversation = (id: string, title: string) => {
    const newConversation = {
      id,
      title,
      history: [],
    };

    setConversations((prev) => [newConversation, ...prev]);
    setActiveConversationId(id);
  };

  // Rename a conversation
  const renameConversation = async (id: string, newTitle: string) => {
    // Update locally first for responsive UI
    setConversations((prev) =>
      prev.map((conv) => (conv.id === id ? { ...conv, title: newTitle } : conv))
    );

    // For logged-in users, update on the server
    if (user?.id) {
      try {
        await fetch("/api/conversations", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id,
            title: newTitle,
            userId: user.id,
          }),
        });
      } catch (error) {
        console.error("Error updating conversation title on server:", error);
      }
    }
  };

  // Delete a conversation
  const deleteConversation = async (id: string) => {
    // Remove conversation from list
    setConversations((prev) => prev.filter((conv) => conv.id !== id));

    // If deleting active conversation, switch to another one or create new
    if (id === activeConversationId) {
      if (conversations.length > 1) {
        // Find the next conversation to make active
        const remainingConversations = conversations.filter(
          (conv) => conv.id !== id
        );
        setActiveConversationId(remainingConversations[0].id);
      } else {
        createNewConversation();
      }
    }

    // For logged-in users, delete on the server
    if (user?.id) {
      try {
        await fetch(`/api/conversations?id=${id}&userId=${user.id}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("Error deleting conversation on server:", error);
      }
    }
  };

  // Switch active conversation
  const switchConversation = (id: string) => {
    setActiveConversationId(id);
  };

  // Update a conversation's history
  const updateConversationHistory = (
    id: string,
    userMessage: string,
    aiResponse: string
  ) => {
    setConversations((prev) =>
      prev.map((conv) => {
        if (conv.id === id) {
          // Update conversation title based on first message if it's default
          let updatedTitle = conv.title;
          if (conv.history.length === 0 && userMessage.length > 0) {
            // Use first 30 chars of user message as title
            updatedTitle =
              userMessage.substring(0, 30) +
              (userMessage.length > 30 ? "..." : "");
          }

          return {
            ...conv,
            title: updatedTitle,
            history: [...conv.history, { user: userMessage, ai: aiResponse }],
          };
        }
        return conv;
      })
    );
  };

  // Update conversation history with streaming AI response
  const updateStreamingResponse = (id: string, aiResponse: string) => {
    setConversations((prev) =>
      prev.map((conv) => {
        if (conv.id === id && conv.history.length > 0) {
          const updatedHistory = [...conv.history];
          const lastIndex = updatedHistory.length - 1;

          updatedHistory[lastIndex] = {
            user: updatedHistory[lastIndex].user,
            ai: aiResponse,
          };

          return { ...conv, history: updatedHistory };
        }
        return conv;
      })
    );
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent, isLongTerm = false) => {
    e.preventDefault();
    const userMessage = input;
    setInput("");

    // Check if we have an active conversation, or create a new one
    let conversationId = activeConversationId;
    if (!conversationId) {
      conversationId = (await createNewConversation()) as string;
      if (!conversationId) {
        console.error("Failed to create a new conversation");
        return;
      }
    }

    // Add user message to conversation immediately
    setConversations((prev) =>
      prev.map((conv) => {
        if (conv.id === conversationId) {
          return {
            ...conv,
            history: [...conv.history, { user: userMessage, ai: "" }],
          };
        }
        return conv;
      })
    );

    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          conversationId: conversationId,
          userId: user?.id,
          isLongTerm: isLongTerm,
          enableWebSearch: enableWebSearch,
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

              // Update streaming response
              updateStreamingResponse(conversationId, aiResponse);
            } catch (e) {
              console.error("JSON parse error:", e);
            }
          }
        }
      }

      // After successful completion, if this is the first message, update the conversation title
      const activeConversation = getActiveConversation();
      if (activeConversation.history.length === 1) {
        const newTitle =
          userMessage.substring(0, 30) + (userMessage.length > 30 ? "..." : "");
        await renameConversation(conversationId, newTitle);
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
    setConversations([]);

    // Reset to a new anonymous session
    createNewConversation();

    router.push("/login");
  };

  const handleLogin = () => {
    router.push("/login");
  };

  const clearConversation = () => {
    // Clear only the active conversation
    setConversations((prev) =>
      prev.map((conv) =>
        conv.id === activeConversationId ? { ...conv, history: [] } : conv
      )
    );
  };

  const saveToLongTermMemory = async (
    conversationId: string,
    messageIndex: number
  ) => {
    if (!user?.id) {
      alert("You must be logged in to save to long-term memory");
      return;
    }

    const conversation = conversations.find((c) => c.id === conversationId);
    if (!conversation || messageIndex >= conversation.history.length) {
      console.error("Conversation or message not found");
      return;
    }

    const message = conversation.history[messageIndex];
    console.log(
      `Saving message to long-term memory: "${message.user.substring(
        0,
        50
      )}..."`
    );
    console.log(`Conversation ID: ${conversationId}`);
    console.log(`User ID: ${user.id}`);

    // Set the saving indicator
    setSavingToLongTerm(messageIndex);

    try {
      // Get the memory ID for this message
      console.log("Step 1: Finding memory ID for this message...");
      const findMemoryResponse = await fetch("/api/findMemory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: conversationId,
          userMessage: message.user,
          userId: user.id,
        }),
      });

      // Log the status code
      console.log(`Find memory response status: ${findMemoryResponse.status}`);

      if (!findMemoryResponse.ok) {
        const errorData = await findMemoryResponse.json();
        console.error("Error finding memory:", errorData);

        if (findMemoryResponse.status === 404) {
          alert(
            "Could not find this message in the database. It may not have been properly saved."
          );
        } else {
          alert(`Could not find memory: ${errorData.error || "Unknown error"}`);
        }
        return;
      }

      const findData = await findMemoryResponse.json();
      console.log(`Step 2: Found memory ID: ${findData.memoryId}`);

      if (!findData.memoryId) {
        alert("Could not find the memory for this message");
        return;
      }

      // Use the longTermMemory endpoint to promote it
      console.log("Step 3: Promoting memory to long-term...");
      const response = await fetch("/api/longTermMemory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memoryId: findData.memoryId,
          userId: user.id,
        }),
      });

      // Handle response
      console.log(`Promotion response status: ${response.status}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          console.log("Successfully saved to long-term memory!");
          alert("Successfully saved to long-term memory!");
        } else {
          console.error("API returned success: false", data);
          alert(
            `Failed to save: ${data.error || "Unknown error"}${
              data.details ? ` - ${data.details}` : ""
            }`
          );
        }
      } else {
        try {
          const errorData = await response.json();
          console.error("Error promoting memory:", errorData);
          // Handle the case where errorData might be empty
          if (errorData && Object.keys(errorData).length > 0) {
            alert(
              `Failed to save: ${errorData.error || "Unknown error"}${
                errorData.details ? ` - ${errorData.details}` : ""
              }`
            );
          } else {
            console.error("Empty error response received");
            alert(
              `Failed to save to long-term memory: Empty error response (status ${response.status})`
            );
          }
        } catch (jsonError) {
          console.error("Error parsing error response:", jsonError);
          alert(
            `Failed to save to long-term memory: Error status ${response.status}`
          );
        }
      }
    } catch (error) {
      console.error("Error saving to long-term memory:", error);
      alert(
        `Failed to save to long-term memory: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    } finally {
      setSavingToLongTerm(null);
    }
  };

  // Get the current conversation
  const activeConversation = getActiveConversation();

  return (
    <Flex h="100vh">
      {/* Conversations Sidebar */}
      <Box
        w="250px"
        borderRight="1px solid"
        borderColor="gray.200"
        p={3}
        overflowY="auto"
        display={{ base: "none", md: "block" }}
      >
        <Button
          colorScheme="blue"
          size="sm"
          w="full"
          mb={4}
          onClick={() => createNewConversation()}
        >
          New Conversation
        </Button>

        <Stack gap={1}>
          {conversations.map((conv) => (
            <Box
              key={conv.id}
              p={2}
              borderRadius="md"
              bg={conv.id === activeConversationId ? "blue.100" : "transparent"}
              _hover={{
                bg: conv.id === activeConversationId ? "blue.100" : "gray.100",
              }}
              cursor="pointer"
              onClick={() => switchConversation(conv.id)}
              display="flex"
              justifyContent="space-between"
              alignItems="center"
            >
              <Text
                fontSize="sm"
                fontWeight={
                  conv.id === activeConversationId ? "bold" : "normal"
                }
                maxW="180px"
                truncate
              >
                {conv.title}
              </Text>
              <Button
                size="xs"
                variant="ghost"
                colorScheme="red"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm("Delete this conversation?")) {
                    deleteConversation(conv.id);
                  }
                }}
              >
                ×
              </Button>
            </Box>
          ))}
        </Stack>
      </Box>

      {/* Main Chat Area */}
      <Box
        flex="1"
        p={4}
        maxW={{ base: "100%", md: "calc(100% - 250px)" }}
        margin="0 auto"
        overflowY="auto"
      >
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push("/longterm-memories")}
              >
                View Long-Term Memories
              </Button>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                Sign Out
              </Button>
            </Box>
          ) : authChecked ? (
            <Button variant="outline" size="sm" onClick={handleLogin}>
              Sign In
            </Button>
          ) : null}

          <Box display="flex" gap={2}>
            <Button
              variant="outline"
              size="sm"
              colorScheme="blue"
              onClick={createNewConversation}
              display={{ base: "inline-flex", md: "none" }}
            >
              New
            </Button>
            <Button
              variant="outline"
              size="sm"
              colorScheme="red"
              onClick={clearConversation}
              isDisabled={
                !activeConversation.history ||
                activeConversation.history.length === 0
              }
            >
              Clear Chat
            </Button>
          </Box>
        </Box>

        {/* Chat History */}
        {historyLoading ? (
          <Box textAlign="center" my={8}>
            <Text>Loading conversations...</Text>
          </Box>
        ) : activeConversation.history.length === 0 ? (
          <Box textAlign="center" my={8}>
            <Heading size="md" mb={4}>
              Start a new conversation
            </Heading>
            <Text>Type a message below to begin chatting</Text>
          </Box>
        ) : (
          <Stack direction="column" gap={4} mb={4}>
            {activeConversation.history.map((entry, i) => (
              <Box key={i} w="100%">
                <Text fontWeight="bold" color="purple.600">
                  You: {entry.user}
                </Text>
                <Box
                  display="flex"
                  justifyContent="space-between"
                  alignItems="flex-start"
                  mt={2}
                  mb={2}
                >
                  <Box flex="1">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        div: ({ node, children }) => (
                          <Box
                            p={4}
                            bg="whiteAlpha.100"
                            borderRadius="md"
                            mb={4}
                          >
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
                          const codeContent = String(children).replace(
                            /\n$/,
                            ""
                          );

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
                  {user && (
                    <Button
                      size="xs"
                      ml={2}
                      colorScheme="purple"
                      isLoading={savingToLongTerm === i}
                      onClick={() =>
                        saveToLongTermMemory(activeConversationId, i)
                      }
                    >
                      Save to Long-term Memory
                    </Button>
                  )}
                </Box>
              </Box>
            ))}
          </Stack>
        )}

        <form onSubmit={(e) => handleSubmit(e, saveAsLongTerm)}>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask me anything..."
            mb={2}
            disabled={loading}
          />
          <Box
            display="flex"
            justifyContent="space-between"
            alignItems="center"
          >
            <Button type="submit" colorScheme="blue" isLoading={loading}>
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
                <Text fontSize="sm" ml={2}>
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
                  <Text fontSize="sm" ml={2}>
                    Save to Long-term Memory
                  </Text>
                </Box>
              )}
            </Box>
          </Box>
        </form>
      </Box>
    </Flex>
  );
}
