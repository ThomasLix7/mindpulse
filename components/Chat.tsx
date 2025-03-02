"use client";
import { useState, useEffect, useRef } from "react";
import {
  Box,
  Input,
  Button,
  Text,
  Heading,
  Flex,
  Spinner,
} from "@chakra-ui/react";
import { getCurrentUser, signOut } from "@/utils/supabase-client";
import { useRouter } from "next/navigation";

// Generate a unique conversation ID for local storage
function generateConversationId() {
  return `conv-${Math.random().toString(36).substring(2, 15)}-${Date.now()}`;
}

// Utility function to normalize isLongterm flag checking
function isLongtermMemory(item: any): boolean {
  return Boolean(
    item.is_longterm === true ||
      item.metadata?.isLongterm === true ||
      item.isLongterm === true
  );
}

// Interface for conversation
interface Conversation {
  id: string;
  title: string;
  history: Array<{
    user: string;
    ai: string;
    isLongterm?: boolean;
  }>;
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
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [updatingTitle, setUpdatingTitle] = useState(false);
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

  // Add ref for auto-scrolling
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Initialize or retrieve user information and conversations
  useEffect(() => {
    const checkAuth = async () => {
      try {
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
      } catch (error) {
        console.error("Error initializing chat component:", error);
        setAuthChecked(true);
        setHistoryLoading(false);
      }
    };

    checkAuth();
  }, []); // Keep the original empty dependency array

  // Update the useEffect that watches for conversationId changes
  useEffect(() => {
    if (!user?.id) return;

    console.log(`Chat: conversationId changed to ${conversationId}`);

    // Clear loading state first
    setHistoryLoading(true);

    if (conversationId === "new") {
      // Create a new conversation
      console.log("Chat: Creating new conversation");
      createNewConversation();
      return;
    }

    if (conversationId && conversationId !== "new") {
      // Set this as the active conversation immediately for better UX
      setActiveConversationId(conversationId);

      // Reset any state from previous conversation
      sessionStorage.removeItem(`checked-empty-${conversationId}`);

      // Load the specific conversation
      console.log(`Chat: Loading specific conversation ${conversationId}`);
      loadSpecificConversation(conversationId, user?.id)
        .then((loadedConversation) => {
          console.log("Chat: Loaded conversation data:", loadedConversation);
          console.log(
            "Chat: History length:",
            loadedConversation?.history?.length || 0
          );

          // If we loaded a conversation but it has no history, try loading it again
          // This helps in cases where the conversation metadata exists but history wasn't properly loaded
          if (
            loadedConversation &&
            (!loadedConversation.history ||
              loadedConversation.history.length === 0)
          ) {
            console.log(
              "Chat: Conversation has no history, attempting to force reload"
            );
            // Try fetching it directly from the server
            if (user?.id) {
              const endpoint = `/api/conversations?userId=${encodeURIComponent(
                user.id
              )}&conversationId=${encodeURIComponent(conversationId)}`;
              console.log(
                `Chat: Attempting direct server fetch from ${endpoint}`
              );
              fetch(endpoint)
                .then((response) => {
                  if (!response.ok) {
                    throw new Error(`Server returned ${response.status}`);
                  }
                  return response.json();
                })
                .then((data) => {
                  console.log("Chat: Direct server fetch result:", data);

                  // Log the raw conversation data from the direct fetch
                  console.log("==== DIRECT FETCH RAW DATABASE DATA ====");
                  if (data.conversation && data.conversation.history) {
                    data.conversation.history.forEach(
                      (item: any, index: number) => {
                        console.log(`DIRECT FETCH DB ITEM ${index}:`, {
                          id: item.id,
                          user_message:
                            item.userMessage?.substring(0, 30) + "...",
                          is_longterm: item.is_longterm,
                          metadata: JSON.stringify(item.metadata),
                          hasMetadata: !!item.metadata,
                          metadataIsLongterm: item.metadata?.isLongterm,
                        });
                      }
                    );
                  }

                  if (data.conversation && data.conversation.history) {
                    // Convert the server history format to client format
                    const formattedHistory = data.conversation.history.map(
                      (item: any) => {
                        // Log the status of both flags for debugging
                        console.log(
                          `Memory item ${item.id || "unknown"}: is_longterm=${
                            item.is_longterm
                          }, metadata.isLongterm=${item.metadata?.isLongterm}`
                        );

                        // Use our utility function to determine longterm status
                        const itemIsLongterm = isLongtermMemory(item);
                        console.log(
                          `MEMORY STATUS: isLongterm=${
                            itemIsLongterm ? "TRUE" : "FALSE"
                          } (using utility function)`
                        );

                        return {
                          user: item.userMessage,
                          ai: item.aiResponse,
                          isLongterm: itemIsLongterm,
                        };
                      }
                    );

                    // Log the transformed history objects in direct fetch
                    console.log(
                      "==== DIRECT FETCH MAPPED CONVERSATION HISTORY ===="
                    );
                    formattedHistory.forEach((item: any, index: number) => {
                      console.log(`DIRECT MAPPED ITEM ${index}:`, {
                        user: item.user?.substring(0, 30) + "...",
                        isLongterm: item.isLongterm,
                        isLongtermType: typeof item.isLongterm,
                      });
                    });

                    // Update the conversation with the fetched history
                    const updatedConversation = {
                      ...loadedConversation,
                      history: formattedHistory, // Use the converted history format
                    };
                    setConversations((prevConversations) => {
                      const updatedConversations = [...prevConversations];
                      const index = updatedConversations.findIndex(
                        (c) => c.id === conversationId
                      );
                      if (index !== -1) {
                        updatedConversations[index] = updatedConversation;
                      }
                      return updatedConversations;
                    });
                    console.log(
                      "Chat: Updated conversation with fetched history"
                    );
                  }
                })
                .catch((error) => {
                  console.error("Chat: Error in direct server fetch:", error);
                })
                .finally(() => {
                  setHistoryLoading(false);
                });
            } else {
              setHistoryLoading(false);
            }
          } else {
            setHistoryLoading(false);
          }
        })
        .catch((error) => {
          console.error("Chat: Error loading conversation:", error);
          setHistoryLoading(false);
        });
    }
  }, [conversationId, user?.id]);

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

            // Dispatch an event to notify the sidebar of the new conversation
            window.dispatchEvent(
              new CustomEvent("conversation-created", {
                detail: newConversation,
              })
            );

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

      // Dispatch an event to notify the sidebar of the new conversation
      window.dispatchEvent(
        new CustomEvent("conversation-created", {
          detail: newConversation,
        })
      );

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

      // Dispatch an event to notify the sidebar of the new conversation
      window.dispatchEvent(
        new CustomEvent("conversation-created", {
          detail: newConversation,
        })
      );

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

      if (!res.ok) {
        throw new Error(`API responded with status: ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error("Response body reader could not be created");
      }

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

      console.log(
        "Stream completed, final response length:",
        aiResponse.length
      );

      // Ensure the final response is properly stored in the conversation history
      if (aiResponse) {
        // Final update to make sure the complete response is saved
        setConversations((prev) =>
          prev.map((conv) => {
            if (conv.id === conversationId && conv.history.length > 0) {
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

        // After successful completion, if this is the first message, update the conversation title
        const activeConversation = getActiveConversation();
        if (activeConversation.history.length === 1) {
          const newTitle =
            userMessage.substring(0, 30) +
            (userMessage.length > 30 ? "..." : "");
          await renameConversation(conversationId, newTitle);
        }
      } else {
        console.error("No AI response received after stream completed");
      }
    } catch (e) {
      console.error("Chat API or stream error:", e);

      // Show an error message in the UI by updating the current conversation
      setConversations((prev) =>
        prev.map((conv) => {
          if (conv.id === conversationId && conv.history.length > 0) {
            const updatedHistory = [...conv.history];
            const lastIndex = updatedHistory.length - 1;

            updatedHistory[lastIndex] = {
              user: updatedHistory[lastIndex].user,
              ai: "Sorry, there was an error processing your request. Please try again.",
            };

            return { ...conv, history: updatedHistory };
          }
          return conv;
        })
      );
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

  // Add a forgetFromLongTermMemory function
  const forgetFromLongTermMemory = async (
    conversationId: string,
    messageIndex: number
  ) => {
    if (!user?.id) {
      alert("You must be logged in to manage long-term memory");
      return;
    }

    const conversation = conversations.find((c) => c.id === conversationId);
    if (!conversation || messageIndex >= conversation.history.length) {
      console.error("Conversation or message not found");
      return;
    }

    const message = conversation.history[messageIndex];
    console.log("FORGET FROM LONGTERM - BEFORE ACTION:", {
      messageIndex,
      messageIsLongterm: message.isLongterm,
      utilityFunctionResult: isLongtermMemory(message),
    });

    console.log(
      `Removing message from long-term memory: "${message.user.substring(
        0,
        50
      )}..."`
    );
    console.log(`Conversation ID: ${conversationId}`);
    console.log(`User ID: ${user.id}`);

    // Set the saving indicator (reuse the same state variable)
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

      // Use the memory endpoint to forget it, passing params as URL query params
      console.log(
        `Step 3: Calling API to update memory status for ID: ${findData.memoryId}`
      );

      // Important: Use URL parameters for DELETE instead of body
      const deleteUrl = `/api/memory?userId=${encodeURIComponent(
        user.id
      )}&memoryId=${encodeURIComponent(findData.memoryId)}`;
      console.log(`DELETE request URL: ${deleteUrl}`);

      const response = await fetch(deleteUrl, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });

      // Handle response
      console.log(`Forget response status: ${response.status}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          console.log("Successfully removed from long-term memory!");

          // Only show alert if not an active conversation to avoid disrupting the chat flow
          const isActiveConversation = conversations.some(
            (c) => c.id === conversationId
          );
          if (!isActiveConversation) {
            alert("Successfully removed from long-term memory!");
          }

          // Update local state to reflect the change
          setConversations((prev) =>
            prev.map((conv) => {
              if (conv.id === conversationId) {
                const updatedHistory = [...conv.history];
                updatedHistory[messageIndex] = {
                  ...updatedHistory[messageIndex],
                  isLongterm: false,
                };

                console.log("FORGET FROM LONGTERM - AFTER SUCCESS:", {
                  messageIndex,
                  originalIsLongterm: conv.history[messageIndex].isLongterm,
                  newIsLongterm: false,
                  resultObject: updatedHistory[messageIndex],
                });

                return { ...conv, history: updatedHistory };
              }
              return conv;
            })
          );
        } else {
          console.error("API returned success: false", data);
          alert(
            `Failed to remove: ${data.error || "Unknown error"}${
              data.details ? ` - ${data.details}` : ""
            }`
          );
        }
      } else {
        try {
          const errorData = await response.json();
          console.error("Error removing memory:", errorData);
          alert(
            `Failed to remove: ${errorData.error || "Unknown error"}${
              errorData.details ? ` - ${errorData.details}` : ""
            }`
          );
        } catch (jsonError) {
          console.error("Error parsing error response:", jsonError);
          alert(
            `Failed to remove from long-term memory: Error status ${response.status}`
          );
        }
      }
    } catch (error) {
      console.error("Error removing from long-term memory:", error);
      alert(
        `Failed to remove from long-term memory: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    } finally {
      setSavingToLongTerm(null);
    }
  };

  // Update the saveToLongTermMemory function to update local state after saving
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
    console.log("SAVE TO LONGTERM - BEFORE ACTION:", {
      messageIndex,
      messageIsLongterm: message.isLongterm,
      utilityFunctionResult: isLongtermMemory(message),
    });

    // Set the saving indicator
    setSavingToLongTerm(messageIndex);

    try {
      console.log("Step 1: Finding memory ID for this message...");
      // Get the memory ID for this message
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
      console.log(
        `Step 3: Calling API to promote memory ID: ${findData.memoryId} to long-term`
      );
      const response = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memoryId: findData.memoryId,
          userId: user.id,
        }),
      });

      // Handle response
      console.log(`Promote response status: ${response.status}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          console.log("Successfully saved to long-term memory!");

          // Only show alert if not an active conversation to avoid disrupting the chat flow
          const isActiveConversation = conversations.some(
            (c) => c.id === conversationId
          );
          if (!isActiveConversation) {
            alert("Successfully saved to long-term memory!");
          }

          // Update local state to reflect the change
          setConversations((prev) =>
            prev.map((conv) => {
              if (conv.id === conversationId) {
                const updatedHistory = [...conv.history];
                updatedHistory[messageIndex] = {
                  ...updatedHistory[messageIndex],
                  isLongterm: true,
                };

                console.log("SAVE TO LONGTERM - AFTER SUCCESS:", {
                  messageIndex,
                  originalIsLongterm: conv.history[messageIndex].isLongterm,
                  newIsLongterm: true,
                  resultObject: updatedHistory[messageIndex],
                });

                return { ...conv, history: updatedHistory };
              }
              return conv;
            })
          );
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

  // Load a specific conversation by ID
  const loadSpecificConversation = async (
    conversationId: string,
    userId?: string
  ) => {
    console.log(
      `loadSpecificConversation: Starting to load conversation ${conversationId}`
    );

    // Don't load if we already checked this conversation was empty (prevents infinite loops)
    const checkedEmpty = sessionStorage.getItem(
      `checked-empty-${conversationId}`
    );
    if (checkedEmpty) {
      console.log(
        `Already checked that conversation ${conversationId} is empty, skipping load`
      );
      setHistoryLoading(false);
      return null;
    }

    // Set loading state
    setHistoryLoading(true);

    try {
      // First check if we already have this conversation in memory
      console.log(
        "loadSpecificConversation: Checking memory conversations first"
      );
      const existingConversation = conversations.find(
        (c) => c.id === conversationId
      );

      if (existingConversation) {
        console.log(
          "loadSpecificConversation: Found in memory:",
          existingConversation
        );
        console.log(
          "loadSpecificConversation: History length:",
          existingConversation.history?.length || 0
        );

        // If conversation exists but has no history, check if we need to load from server
        if (
          (!existingConversation.history ||
            existingConversation.history.length === 0) &&
          user?.id
        ) {
          console.log(
            "loadSpecificConversation: Memory conversation has no history, checking server"
          );
        } else {
          // We have a valid memory conversation with history, use it
          setHistoryLoading(false);
          return existingConversation;
        }
      }

      // Check localStorage for anonymous users
      if (!user?.id) {
        console.log(
          "loadSpecificConversation: Anonymous user, checking localStorage"
        );
        try {
          const storedConversationsString =
            localStorage.getItem("conversations");
          if (storedConversationsString) {
            const storedConversations = JSON.parse(storedConversationsString);
            const storedConvo = storedConversations.find(
              (c: any) => c.id === conversationId
            );

            if (storedConvo) {
              console.log(
                "loadSpecificConversation: Found in localStorage:",
                storedConvo
              );
              console.log(
                "loadSpecificConversation: History length:",
                storedConvo.history?.length || 0
              );

              // Ensure it has a history array even if empty
              storedConvo.history = storedConvo.history || [];

              // Add to memory
              setConversations((prevConvos) => {
                // Avoid duplicates
                const filtered = prevConvos.filter(
                  (c) => c.id !== conversationId
                );
                return [...filtered, storedConvo];
              });

              setHistoryLoading(false);
              return storedConvo;
            } else {
              console.log(
                `Conversation ${conversationId} not found in localStorage`
              );
            }
          } else {
            console.log("No conversations found in localStorage");
          }
        } catch (error) {
          console.error("Error reading from localStorage:", error);
        }

        setHistoryLoading(false);
        return null;
      }

      // For authenticated users, fetch from server
      if (user?.id) {
        console.log(
          `loadSpecificConversation: Fetching from server for user ${user.id} and conversation ${conversationId}`
        );
        try {
          const response = await fetch(
            `/api/conversations?userId=${encodeURIComponent(
              user.id
            )}&conversationId=${encodeURIComponent(conversationId)}`
          );

          if (!response.ok) {
            console.error(
              `Server returned ${response.status} when fetching conversation:`,
              await response.text()
            );
            throw new Error(`Server returned ${response.status}`);
          }

          const data = await response.json();
          console.log("loadSpecificConversation: Server response:", data);

          // Log the raw conversation data from the database
          console.log("==== RAW DATABASE DATA ====");
          if (data.conversation && data.conversation.history) {
            data.conversation.history.forEach((item: any, index: number) => {
              console.log(`DB ITEM ${index}:`, {
                id: item.id,
                user_message: item.userMessage?.substring(0, 30) + "...",
                is_longterm: item.is_longterm,
                metadata: JSON.stringify(item.metadata),
                hasMetadata: !!item.metadata,
                metadataIsLongterm: item.metadata?.isLongterm,
              });
            });
          }

          if (data.conversation) {
            // Ensure history is always an array
            data.conversation.history = data.conversation.history || [];
            console.log(
              "loadSpecificConversation: History from server length:",
              data.conversation.history.length
            );

            // IMPORTANT: Convert the server history format (userMessage/aiResponse) to client format (user/ai)
            const formattedHistory = data.conversation.history.map(
              (item: any) => {
                // Log the status of both flags for debugging
                console.log(
                  `Memory item ${item.id || "unknown"}: is_longterm=${
                    item.is_longterm
                  }, metadata.isLongterm=${item.metadata?.isLongterm}`
                );

                // Use our utility function to determine longterm status
                const itemIsLongterm = isLongtermMemory(item);
                console.log(
                  `MEMORY STATUS: isLongterm=${
                    itemIsLongterm ? "TRUE" : "FALSE"
                  } (using utility function)`
                );

                return {
                  user: item.userMessage,
                  ai: item.aiResponse,
                  isLongterm: itemIsLongterm,
                };
              }
            );

            // Log the transformed history objects
            console.log("==== MAPPED CONVERSATION HISTORY ====");
            formattedHistory.forEach((item: any, index: number) => {
              console.log(`MAPPED ITEM ${index}:`, {
                user: item.user?.substring(0, 30) + "...",
                isLongterm: item.isLongterm,
                isLongtermType: typeof item.isLongterm,
              });
            });

            const formattedConversation = {
              id: data.conversation.id,
              title: data.conversation.title || "New Conversation",
              created_at: data.conversation.created_at,
              updated_at: data.conversation.updated_at,
              history: formattedHistory, // Use the converted history format
            };

            console.log(
              "loadSpecificConversation: Formatted conversation:",
              formattedConversation
            );

            // Update conversations in memory
            setConversations((prevConvos) => {
              // Avoid duplicates
              const filtered = prevConvos.filter(
                (c) => c.id !== conversationId
              );
              return [...filtered, formattedConversation];
            });

            setHistoryLoading(false);

            // Mark as empty if needed for future reference
            if (
              !formattedConversation.history ||
              formattedConversation.history.length === 0
            ) {
              console.log(
                `Marking conversation ${conversationId} as checked-empty`
              );
              sessionStorage.setItem(`checked-empty-${conversationId}`, "true");
            }

            return formattedConversation;
          } else {
            console.log("No conversation returned from server");
            sessionStorage.setItem(`checked-empty-${conversationId}`, "true");
          }
        } catch (error) {
          console.error("Error fetching conversation from server:", error);
        }
      }

      console.log(`No conversation found for ID: ${conversationId}`);
      setHistoryLoading(false);
      sessionStorage.setItem(`checked-empty-${conversationId}`, "true");
      return null;
    } catch (error) {
      console.error("Error in loadSpecificConversation:", error);
      setHistoryLoading(false);
      return null;
    }
  };

  // Add effect to scroll to bottom when messages change
  useEffect(() => {
    const activeConvo = getActiveConversation();
    if (chatContainerRef.current && activeConvo.history?.length > 0) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, [conversations, activeConversationId]);

  // Add debug effect for conversation history
  useEffect(() => {
    const activeConvo = getActiveConversation();
    if (activeConvo.history?.length > 0) {
      console.log("🔍 DETAILED HISTORY INSPECTION:");
      console.log("==== FINAL CONVERSATION HISTORY IN STATE ====");
      activeConvo.history.forEach((msg, idx) => {
        console.log(`📝 Message ${idx}:`, {
          user: msg.user?.substring(0, 30) + "...",
          ai: msg.ai?.substring(0, 30) + "...",
          isLongterm: msg.isLongterm,
          isLongtermType: typeof msg.isLongterm,
          allProperties: Object.keys(msg),
          buttonText: isLongtermMemory(msg) ? "FORGET" : "REMEMBER",
          utilityFunctionResult: isLongtermMemory(msg),
        });
      });
    }
  }, [conversations, activeConversationId]);

  // Start title edit mode
  const startTitleEdit = () => {
    setNewTitle(getActiveConversation().title);
    setIsEditingTitle(true);
  };

  // Cancel title edit
  const cancelTitleEdit = () => {
    setIsEditingTitle(false);
    setNewTitle("");
  };

  // Submit title update
  const submitTitleUpdate = async () => {
    if (!newTitle.trim()) {
      return;
    }

    setUpdatingTitle(true);
    try {
      await renameConversation(activeConversationId, newTitle.trim());
      setIsEditingTitle(false);
    } catch (error) {
      console.error("Error updating title:", error);
      alert("Failed to update the conversation title. Please try again.");
    } finally {
      setUpdatingTitle(false);
    }
  };

  return (
    <Flex
      h="92vh"
      maxH="100vh"
      flexDirection="column"
      bg="black"
      color="white"
      overflow="hidden"
      position="absolute"
      bottom={0}
      left={0}
      right={0}
    >
      {/* Top Bar with Conversation Title and Controls - Fixed */}
      <Box
        w="100%"
        p={3}
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        position="sticky"
        height="50px"
        zIndex={2}
        flexShrink={0}
      >
        {/* Current Conversation Title with Edit Mode */}
        {isEditingTitle ? (
          <Flex alignItems="center" flex="1" mr={2}>
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              size="md"
              fontSize="md"
              fontWeight="medium"
              bg="gray.800"
              color="white"
              border="1px solid"
              borderColor="blue.400"
              mr={2}
              placeholder="Enter new title"
              autoFocus
              onKeyPress={(e) => {
                if (e.key === "Enter") submitTitleUpdate();
              }}
            />
            <Button
              size="sm"
              colorScheme="blue"
              onClick={submitTitleUpdate}
              isLoading={updatingTitle}
              mr={1}
            >
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={cancelTitleEdit}
              disabled={updatingTitle}
            >
              Cancel
            </Button>
          </Flex>
        ) : (
          <Flex alignItems="center">
            <Heading size="md" fontWeight="medium" color="white">
              {getActiveConversation().title || "New Conversation"}
            </Heading>
            <Button
              size="sm"
              variant="ghost"
              ml={2}
              onClick={startTitleEdit}
              display={activeConversationId ? "inline-flex" : "none"}
              _hover={{ bg: "gray.700" }}
              title="Edit title"
            >
              ✐
            </Button>
          </Flex>
        )}

        {/* Move Clear Chat button to title bar */}
        <Box display="flex" alignItems="center" gap={2}>
          <Button
            variant="outline"
            size="sm"
            colorScheme="red"
            onClick={clearConversation}
            isDisabled={
              !getActiveConversation().history ||
              getActiveConversation().history.length === 0
            }
            borderColor="red.700"
            color="red.300"
            _hover={{ bg: "red.900" }}
          >
            Clear Chat
          </Button>
        </Box>
      </Box>

      {/* Chat Content - Scrollable area between fixed elements */}
      <Box
        position="relative"
        flex="1"
        overflowY="auto"
        overflowX="hidden"
        ref={chatContainerRef}
        minHeight={0} /* Critical for flex child scrolling */
      >
        {/* Mobile-only Chat Controls */}
        <Box display="flex" justifyContent="space-between" alignItems="center">
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
        </Box>

        {/* Chat Messages */}
        <Box px={4} pb={4}>
          {historyLoading ? (
            <Box textAlign="center" py={6}>
              <Spinner size="sm" color="blue.400" mb={2} />
              <Text fontSize="sm" color="gray.400">
                Loading conversation...
              </Text>
            </Box>
          ) : (
            <>
              {/* Display the active conversation history */}
              {activeConversationId &&
                (() => {
                  // Find the active conversation
                  const activeConvo = conversations.find(
                    (c) => c.id === activeConversationId
                  );

                  // Add detailed history debugging
                  if (
                    activeConvo &&
                    activeConvo.history &&
                    activeConvo.history.length > 0
                  ) {
                    console.log("First history item:", activeConvo.history[0]);
                    console.log(
                      "History keys:",
                      Object.keys(activeConvo.history[0])
                    );
                  }

                  if (
                    !activeConvo ||
                    !activeConvo.history ||
                    activeConvo.history.length === 0
                  ) {
                    return (
                      <Box textAlign="center" py={6}>
                        <Text fontSize="sm" color="gray.400">
                          Start a new conversation below
                        </Text>
                      </Box>
                    );
                  }

                  return (
                    <Box>
                      {activeConvo.history.map((msg, idx) => {
                        console.log(`Rendering message ${idx}:`, msg);
                        // Add more detailed debugging about the isLongterm status
                        console.log(
                          `MESSAGE ${idx} LONGTERM STATUS: ${
                            Boolean(msg.isLongterm)
                              ? "TRUE (should show FORGET)"
                              : "FALSE (should show REMEMBER)"
                          }`
                        );

                        // Check for alternative property names that might exist
                        const hasUserMessage = "userMessage" in msg;
                        const hasAiResponse = "aiResponse" in msg;

                        // Use either the expected property names or alternatives
                        const userText: string =
                          msg.user ||
                          (hasUserMessage ? (msg as any).userMessage : "");
                        const aiText: string =
                          msg.ai ||
                          (hasAiResponse ? (msg as any).aiResponse : "");

                        return (
                          <Box
                            key={idx}
                            mb={0}
                            p={3}
                            borderRadius="md"
                            backgroundColor={userText ? "black" : "gray.900"}
                          >
                            <Box
                              display="flex"
                              justifyContent="space-between"
                              alignItems="flex-start"
                            >
                              <Box flex="1">
                                {userText && (
                                  <Text
                                    fontWeight="bold"
                                    color="blue.300"
                                    mb={1}
                                  >
                                    You:
                                  </Text>
                                )}
                                {userText && <Text>{userText}</Text>}

                                {aiText && (
                                  <Text
                                    fontWeight="bold"
                                    color="green.300"
                                    mt={userText ? 3 : 0}
                                    mb={1}
                                  >
                                    Lex:
                                  </Text>
                                )}
                                {aiText && (
                                  <Box mt={2}>
                                    <Text whiteSpace="pre-wrap">{aiText}</Text>
                                  </Box>
                                )}
                              </Box>

                              {/* Save to Memory button with fixed logic */}
                              {user && (
                                <Button
                                  size="xs"
                                  ml={2}
                                  variant="outline"
                                  isLoading={savingToLongTerm === idx}
                                  onClick={() => {
                                    // Use our utility function for consistency
                                    const currentStatus = isLongtermMemory(msg);
                                    console.log(
                                      `BUTTON ${idx} CLICKED - Status check using utility function: ${
                                        currentStatus
                                          ? "TRUE (forget)"
                                          : "FALSE (remember)"
                                      }`
                                    );

                                    if (currentStatus) {
                                      forgetFromLongTermMemory(
                                        activeConversationId,
                                        idx
                                      );
                                    } else {
                                      saveToLongTermMemory(
                                        activeConversationId,
                                        idx
                                      );
                                    }
                                  }}
                                  borderColor={
                                    isLongtermMemory(msg)
                                      ? "red.600"
                                      : "gray.600"
                                  }
                                  color={
                                    isLongtermMemory(msg)
                                      ? "red.300"
                                      : "gray.300"
                                  }
                                  _hover={{
                                    bg: isLongtermMemory(msg)
                                      ? "red.900"
                                      : "gray.800",
                                    color: "white",
                                  }}
                                  title={
                                    isLongtermMemory(msg)
                                      ? "Remove this exchange from your long-term memory"
                                      : "Save this exchange to your long-term memory for AI to reference in future conversations"
                                  }
                                >
                                  {isLongtermMemory(msg)
                                    ? "Forget"
                                    : "Remember"}
                                </Button>
                              )}
                            </Box>
                          </Box>
                        );
                      })}
                    </Box>
                  );
                })()}
            </>
          )}
        </Box>
      </Box>

      {/* Input Area - Fixed at bottom */}
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
                    Remember the conversation
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
