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

interface ChatProps {
  conversationId?: string;
  isHomePage?: boolean;
}

export default function Chat({
  conversationId,
  isHomePage = false,
}: ChatProps) {
  const [input, setInput] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string>(
    conversationId || ""
  );
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [savingToLongTerm, setSavingToLongTerm] = useState<number | null>(null);
  const [saveAsLongTerm, setSaveAsLongTerm] = useState(false);
  const [enableWebSearch, setEnableWebSearch] = useState<boolean>(false);
  const router = useRouter();

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
      console.log(
        "Loading conversations with conversationId from URL:",
        conversationId
      );

      // Special case for "new" - we'll handle this in the conversationId effect
      if (conversationId === "new") {
        console.log(
          "Chat component: This is a new conversation request, handled in conversationId effect"
        );
        setHistoryLoading(false);
        return;
      }

      // If we have a specific conversationId, only load that conversation
      // This prevents loading all conversations unnecessarily
      if (conversationId && user?.id) {
        console.log(
          `Loading only conversation ${conversationId} for authenticated user`
        );
        await loadSpecificConversation(conversationId, user.id);
        setHistoryLoading(false);
      } else {
        // Load all conversations only if we're on the main chat page or for anonymous users
        await loadConversations(user?.id);
      }
    };

    checkAuth();
  }, []); // Keep the original empty dependency array

  // When conversationId prop changes, update the active conversation and load it
  useEffect(() => {
    if (!conversationId) return;

    console.log(
      "Chat component: URL conversationId changed to:",
      conversationId
    );

    // Special handling for "new" conversation ID
    if (conversationId === "new") {
      console.log("This is a request for a new conversation, creating now");
      // Only create a new conversation once we've checked auth
      if (authChecked) {
        console.log("Auth is checked, creating new conversation");
        createNewConversation();
      }
      return;
    }

    // For existing conversations
    if (conversationId !== activeConversationId) {
      // Set this as active immediately for better UX
      setActiveConversationId(conversationId);

      // Clear any previous tracking for this conversation to force a fresh check
      sessionStorage.removeItem(`checked-empty-${conversationId}`);

      // If user has been determined and we're not already loading
      if (authChecked && !historyLoading) {
        console.log(`Chat component: Loading conversation ${conversationId}`);
        // Load this specific conversation with all its memories
        loadSpecificConversation(conversationId, user?.id);
      }
    }
  }, [
    conversationId,
    activeConversationId,
    authChecked,
    historyLoading,
    user?.id,
  ]);

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
      // Only get conversation list without history by default (more efficient)
      // We'll load history only when a conversation is selected
      const response = await fetch(`/api/conversations?userId=${userId}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (response.ok) {
        const data = await response.json();
        console.log("Server returned conversations:", data);

        if (
          data.success &&
          data.conversations &&
          Array.isArray(data.conversations)
        ) {
          // Map server data to client format, initializing empty history arrays
          const clientConversations = data.conversations.map((conv: any) => ({
            id: conv.id,
            title: conv.title,
            history: [], // Initialize with empty history that will be loaded when needed
          }));

          console.log(`Setting ${clientConversations.length} conversations`);
          setConversations(clientConversations);

          // If we have a conversationId prop from the URL and it exists in our conversations, prioritize that
          if (
            conversationId &&
            clientConversations.some(
              (c: Conversation) => c.id === conversationId
            )
          ) {
            console.log("Using conversationId from URL:", conversationId);
            // We already set activeConversationId to conversationId in the initial state
          }
          // Otherwise set active conversation to the most recent one
          else if (clientConversations.length > 0) {
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

        // If we have a conversationId prop, prioritize that over stored active conversation
        if (
          conversationId &&
          parsedConversations.some((c: Conversation) => c.id === conversationId)
        ) {
          // Do nothing here - we already set activeConversationId to conversationId in the initial state
        }
        // Otherwise fall back to stored active conversation
        else if (
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

    console.log("Creating new conversation...");

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

            // Navigate to the conversation instead of just setting active ID
            router.push(`/chat/${data.conversation.id}`);

            return data.conversation.id;
          } else {
            // Fallback to client-side ID if server creation fails
            newConversationId = generateConversationId();
          }
        } else {
          newConversationId = generateConversationId();
        }
      } catch (error) {
        console.error("Error creating conversation on server:", error);
        newConversationId = generateConversationId();
      }
    } else {
      // For anonymous users, create a local conversation
      newConversationId = generateConversationId();
      const newConversation = createLocalConversation(
        newConversationId,
        defaultTitle
      );
      setConversations((prev) => [newConversation, ...prev]);

      // Navigate to the conversation instead of just setting active ID
      router.push(`/chat/${newConversationId}`);

      return newConversationId;
    }

    // Create the conversation locally if server creation failed
    if (newConversationId) {
      const newConversation = createLocalConversation(
        newConversationId,
        defaultTitle
      );
      setConversations((prev) => [newConversation, ...prev]);

      // Navigate to the conversation instead of just setting active ID
      router.push(`/chat/${newConversationId}`);

      return newConversationId;
    }

    return null;
  };

  // Create local conversation (for anonymous users or fallback)
  const createLocalConversation = (id: string, title: string): Conversation => {
    const newConversation = {
      id,
      title,
      history: [],
    };
    return newConversation;
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

    // Navigate to the conversation page when switching conversations
    if (!isHomePage) {
      router.push(`/chat/${id}`);
    }
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

  const clearConversation = async () => {
    // Clear only the active conversation in the UI
    setConversations((prev) =>
      prev.map((conv) =>
        conv.id === activeConversationId ? { ...conv, history: [] } : conv
      )
    );

    // For logged-in users, clear history in the database
    if (user?.id) {
      try {
        await fetch(`/api/conversations/clear`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: activeConversationId,
            userId: user.id,
          }),
        });
      } catch (error) {
        console.error("Error clearing conversation history on server:", error);
      }
    }
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
      const findMemoryResponse = await fetch("/api/memory", {
        method: "PUT",
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

      // Use the memory endpoint to promote it
      console.log("Step 3: Promoting memory to long-term...");
      const response = await fetch("/api/memory", {
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

  // Check if the conversation from URL exists in our loaded conversations
  const checkConversationExists = (id: string) => {
    return conversations.some((conv) => conv.id === id);
  };

  // Safety check to ensure the current conversation is loaded with all its memories
  useEffect(() => {
    // Skip if we're still loading or not authenticated yet
    if (historyLoading || !authChecked) {
      return;
    }

    // Only attempt to load if we have an active conversation ID and it's not "new"
    if (activeConversationId && activeConversationId !== "new") {
      // Check if we've already confirmed this conversation is empty
      const checkedEmptyKey = `checked-empty-${activeConversationId}`;
      if (sessionStorage.getItem(checkedEmptyKey)) {
        console.log(
          `Conversation ${activeConversationId} already confirmed empty, not reloading`
        );
        return;
      }

      const exists = checkConversationExists(activeConversationId);

      // Only load if the conversation doesn't exist at all in our state
      if (!exists) {
        console.log(
          `Conversation ${activeConversationId} doesn't exist in state, loading it now`
        );
        loadSpecificConversation(activeConversationId, user?.id);
        return;
      }

      // No need to check if it has history - that responsibility now belongs solely
      // to the loadSpecificConversation function with its empty check tracking
    }
  }, [historyLoading, authChecked, activeConversationId, user?.id]);

  // Get the current conversation
  const activeConversation = getActiveConversation();

  // Load a specific conversation by ID
  const loadSpecificConversation = async (
    conversationId: string,
    userId?: string
  ) => {
    console.log(`Loading specific conversation with ID: ${conversationId}`);

    // Special case for "new" - redirect to the new conversation page
    if (conversationId === "new") {
      console.log(
        "This is a request for a new conversation already being handled by the useEffect"
      );
      return;
    }

    // Don't re-fetch if we're already loading
    if (historyLoading) {
      console.log(
        "Already loading conversation data, skipping duplicate fetch"
      );
      return;
    }

    // Check if we've already attempted to load this conversation recently
    // This is critical to prevent infinite API calls for empty conversations
    const checkedEmptyKey = `checked-empty-${conversationId}`;
    if (sessionStorage.getItem(checkedEmptyKey)) {
      console.log(
        `Conversation ${conversationId} already checked and confirmed empty, not fetching again`
      );
      return;
    }

    // Set loading state when starting to load a specific conversation
    setHistoryLoading(true);

    // For anonymous users, try to find in localStorage
    if (!userId) {
      const storedConversations = localStorage.getItem(
        "mindpulse-conversations"
      );
      if (storedConversations) {
        try {
          const parsedConversations = JSON.parse(storedConversations);
          const specificConversation = parsedConversations.find(
            (c: Conversation) => c.id === conversationId
          );

          if (specificConversation) {
            console.log(
              "Found conversation in localStorage:",
              specificConversation
            );

            // Add this conversation to our loaded conversations if not already there
            setConversations((prev) => {
              // Check if already in the list
              if (prev.some((c) => c.id === conversationId)) {
                return prev;
              }
              return [specificConversation, ...prev];
            });

            setActiveConversationId(conversationId);
            setHistoryLoading(false);
            return;
          }
        } catch (e) {
          console.error("Error parsing stored conversations:", e);
        }
      }

      console.warn(`Conversation ${conversationId} not found in localStorage`);
      setHistoryLoading(false);
      return;
    }

    // For authenticated users, directly fetch from server
    try {
      console.log(
        `Fetching conversation ${conversationId} from server for user ${userId}`
      );

      const response = await fetch(
        `/api/conversations?userId=${userId}&conversationId=${conversationId}`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        }
      );

      if (response.ok) {
        const data = await response.json();
        console.log("Received API response:", data);

        if (data.success && data.conversation) {
          console.log("Server returned conversation:", data.conversation);

          // Format the conversation for client use
          const clientConversation = {
            id: data.conversation.id,
            title: data.conversation.title || "New Conversation",
            history: Array.isArray(data.conversation.history)
              ? data.conversation.history.map((item: any) => ({
                  user: item.userMessage,
                  ai: item.aiResponse,
                }))
              : [], // Ensure history is always an array
          };

          // Update our conversations list
          setConversations((prev) => {
            // Remove this conversation if it exists
            const filtered = prev.filter((c) => c.id !== conversationId);
            // Add the updated version at the beginning
            return [clientConversation, ...filtered];
          });

          setActiveConversationId(conversationId);

          // Log if it's an empty conversation
          if (
            !clientConversation.history ||
            clientConversation.history.length === 0
          ) {
            console.log("Server returned an empty conversation (no history)");
            // Mark as checked but empty to prevent future fetches
            sessionStorage.setItem(checkedEmptyKey, "true");
          }
        } else {
          console.log("Server returned no conversation data");

          // Create an empty conversation object to display in UI
          const emptyConversation = {
            id: conversationId,
            title: "New Conversation",
            history: [],
          };

          // Update conversations list with this empty placeholder
          setConversations((prev) => {
            // Remove if exists
            const filtered = prev.filter((c) => c.id !== conversationId);
            // Add empty placeholder
            return [emptyConversation, ...filtered];
          });

          setActiveConversationId(conversationId);

          // Mark this as a checked empty conversation
          sessionStorage.setItem(checkedEmptyKey, "true");
        }
      } else {
        console.error(`Server returned status: ${response.status}`);

        if (response.status === 404) {
          alert(`Conversation not found. It may have been deleted.`);
          router.push("/chat");
        } else {
          alert(`Error loading conversation. Status: ${response.status}`);
        }

        // Mark as checked to prevent repeated API calls
        sessionStorage.setItem(checkedEmptyKey, "true");
      }
    } catch (error) {
      console.error("Error fetching specific conversation:", error);

      // Try to extract more detailed error information
      let errorMessage = "Unknown error";
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === "string") {
        errorMessage = error;
      } else if (error && typeof error === "object") {
        errorMessage = JSON.stringify(error);
      }

      // Log detailed error info
      console.error(`Error details: ${errorMessage}`);

      // Show user-friendly error message
      alert(`Failed to load conversation: ${errorMessage}`);

      // Mark as checked to prevent repeated API calls
      sessionStorage.setItem(checkedEmptyKey, "true");
    } finally {
      setHistoryLoading(false);
    }
  };

  return (
    <Flex h="100vh" flexDirection="column" bg="black" color="white">
      {/* Top Bar with Conversation Title and Controls */}
      <Box
        w="100%"
        bg="gray.900"
        borderBottom="1px solid"
        borderColor="gray.700"
        p={3}
        display="flex"
        justifyContent="space-between"
        alignItems="center"
      >
        {/* Current Conversation Title */}
        <Heading size="md" fontWeight="medium" color="white">
          {activeConversation.title || "New Conversation"}
        </Heading>

        {/* Authentication/Login Controls */}
        <Box display="flex" alignItems="center" gap={2}>
          {user ? (
            <>
              <Text fontSize="sm" color="gray.300">
                Logged in as: {user.email}
              </Text>
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push("/longterm-memories")}
                borderColor="gray.600"
                color="gray.200"
                _hover={{ bg: "gray.700" }}
              >
                View Memories
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
                borderColor="gray.600"
                color="gray.200"
                _hover={{ bg: "gray.700" }}
              >
                Sign Out
              </Button>
            </>
          ) : authChecked ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogin}
              borderColor="gray.600"
              color="gray.200"
              _hover={{ bg: "gray.700" }}
            >
              Sign In
            </Button>
          ) : null}
        </Box>
      </Box>

      {/* Main Chat Area - Now directly in the column flex layout without the sidebar conditional */}
      <Box
        flex="1"
        p={4}
        display="flex"
        flexDirection="column"
        h="100%"
        overflow="hidden"
        bg="black"
      >
        {/* Chat Controls */}
        <Box display="flex" justifyContent="flex-end" gap={2} mb={4}>
          <Button
            variant="outline"
            size="sm"
            colorScheme="blue"
            onClick={() => router.push("/chat/new")}
            display={{ base: "inline-flex", md: "none" }}
            borderColor="gray.600"
            color="gray.200"
            _hover={{ bg: "gray.800" }}
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
            borderColor="red.700"
            color="red.300"
            _hover={{ bg: "red.900" }}
          >
            Clear Chat
          </Button>
        </Box>

        {/* Chat History */}
        <Box flex="1" overflowY="auto" mb={4}>
          {historyLoading ? (
            <Box textAlign="center" my={8}>
              <Text color="gray.300">Loading conversations...</Text>
            </Box>
          ) : activeConversation.history.length === 0 ? (
            <Box textAlign="center" my={8}>
              <Heading size="md" mb={4} color="gray.300">
                Start a new conversation
              </Heading>
              <Text color="gray.400">
                Type a message below to begin chatting
              </Text>
            </Box>
          ) : (
            <Stack direction="column" gap={4}>
              {activeConversation.history.map((entry, i) => (
                <Box key={i} w="100%">
                  <Text fontWeight="bold" color="purple.300">
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
                            <Box p={4} bg="gray.900" borderRadius="md" mb={4}>
                              {children}
                            </Box>
                          ),
                          p({ children }) {
                            return (
                              <Text
                                mb={4}
                                fontSize="md"
                                lineHeight="tall"
                                color="gray.200"
                              >
                                {children}
                              </Text>
                            );
                          },
                          h1({ children }) {
                            return (
                              <Heading
                                as="h1"
                                size="xl"
                                mt={6}
                                mb={4}
                                color="white"
                              >
                                {children}
                              </Heading>
                            );
                          },
                          h2({ children }) {
                            return (
                              <Heading
                                as="h2"
                                size="lg"
                                mt={5}
                                mb={3}
                                color="white"
                              >
                                {children}
                              </Heading>
                            );
                          },
                          h3({ children }) {
                            return (
                              <Heading
                                as="h3"
                                size="md"
                                mt={4}
                                mb={2}
                                color="white"
                              >
                                {children}
                              </Heading>
                            );
                          },
                          code({ node, className, children, ...props }) {
                            const match = /language-(\w+)/.exec(
                              className || ""
                            );
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
                                borderColor="blue.500"
                                pl={4}
                                my={4}
                                fontStyle="italic"
                                color="blue.300"
                                bg="gray.800"
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
                                color="blue.300"
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
                        bg="purple.600"
                        _hover={{ bg: "purple.500" }}
                      >
                        Save to Memory
                      </Button>
                    )}
                  </Box>
                </Box>
              ))}
            </Stack>
          )}
        </Box>

        {/* Input Area */}
        <Box borderTop="1px solid" borderColor="gray.700" pt={4}>
          <form onSubmit={(e) => handleSubmit(e, saveAsLongTerm)}>
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
            <Box
              display="flex"
              justifyContent="space-between"
              alignItems="center"
            >
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
                      Save to Memory
                    </Text>
                  </Box>
                )}
              </Box>
            </Box>
          </form>
        </Box>
      </Box>
    </Flex>
  );
}
