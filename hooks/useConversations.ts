import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser, supabase } from "@/utils/supabase-client";
import { apiFetch } from "@/utils/api-fetch";
import { Conversation } from "@/types/chat";

function generateConversationId(): string {
  return `conv-${Math.random().toString(36).substring(2, 15)}-${Date.now()}`;
}

function isLongtermMemory(item: any): boolean {
  return Boolean(
    item.is_longterm === true ||
      item.metadata?.isLongterm === true ||
      item.isLongterm === true
  );
}

export function useConversations(
  conversationId?: string,
  isHomePage?: boolean
) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string>(
    conversationId || ""
  );
  const [historyLoading, setHistoryLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const router = useRouter();

  // Get active conversation
  const getActiveConversation = () => {
    return (
      conversations.find((conv) => conv.id === activeConversationId) || {
        id: "",
        title: "",
        history: [],
      }
    );
  };

  // Initialize user and conversations
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { user, error } = await getCurrentUser();
        setUser(user);
        setAuthChecked(true);

        // Load conversations from localStorage or server
        if (conversationId === "new" || !conversationId) {
          setHistoryLoading(false);
          return;
        }

        // Load specific conversation if provided
        if (conversationId && user?.id) {
          await loadSpecificConversation(conversationId, user.id);
          setHistoryLoading(false);
        } else {
          // Load all conversations
          await loadConversations(user?.id);
        }
      } catch (error) {
        console.error("Error initializing chat component:", error);
        setAuthChecked(true);
        setHistoryLoading(false);
      }
    };

    checkAuth();
  }, [conversationId]);

  // Watch for conversationId changes
  useEffect(() => {
    if (!user?.id || !authChecked) return;

    // Clear loading state
    setHistoryLoading(true);

    if (conversationId && conversationId !== "new") {
      // Set as active conversation
      setActiveConversationId(conversationId);
      // Reset previous state
      sessionStorage.removeItem(`checked-empty-${conversationId}`);
      // Load conversation
      loadSpecificConversation(conversationId, user?.id)
        .then(() => setHistoryLoading(false))
        .catch(() => setHistoryLoading(false));
    }
  }, [conversationId, user?.id, authChecked]);

  // Load conversations from localStorage or server
  const loadConversations = async (userId?: string) => {
    setHistoryLoading(true);

    try {
      if (userId) {
        // Fetch from server
        await fetchConversationsFromServer(userId);
      }
    } catch (error) {
      console.error("Error loading conversations:", error);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Fetch conversations from server
  const fetchConversationsFromServer = async (userId: string) => {
    try {
      // Get user's access token
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;

      if (!accessToken) {
        throw new Error("No access token available");
      }

      // Get conversation list without history
      const response = await apiFetch(`/api/conversations?userId=${userId}`, {
        method: "GET",
      });

      if (response.ok) {
        const data = await response.json();

        if (
          data.success &&
          data.conversations &&
          Array.isArray(data.conversations)
        ) {
          // Map server data to client format
          const clientConversations = data.conversations.map((conv: any) => ({
            id: conv.id,
            title: conv.title,
            history: [], // Empty history, loaded when needed
          }));

          setConversations(clientConversations);

          // Prioritize conversationId from URL
          if (
            conversationId &&
            clientConversations.some(
              (c: Conversation) => c.id === conversationId
            )
          ) {
            // Already set in initial state
          }
          // Set most recent conversation
          else if (clientConversations.length > 0) {
            setActiveConversationId(clientConversations[0].id);
          }
          // Don't create new conversation here - let the component handle it
        }
        // Don't create new conversation here - let the component handle it
      }
      // Don't create new conversation here - let the component handle it
    } catch (error) {
      console.error("Error fetching conversations:", error);
      // Don't create new conversation here - let the component handle it
    }
  };

  // Create new conversation
  const createNewConversation = async () => {
    // Prevent multiple simultaneous creations
    if (historyLoading || !user?.id) return null;

    const defaultTitle = "New Conversation";

    try {
      // Get user's access token
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;

      if (!accessToken) {
        throw new Error("No access token available");
      }

      const serverResponse = await apiFetch("/api/conversations", {
        method: "POST",
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

          // Notify sidebar of new conversation
          window.dispatchEvent(
            new CustomEvent("conversation-created", {
              detail: newConversation,
            })
          );

          // Navigate to conversation
          router.push(`/chat/${data.conversation.id}`);

          return data.conversation.id;
        }
      }
    } catch (error) {
      console.error("Error creating conversation:", error);
    }

    return null;
  };

  // Rename conversation
  const renameConversation = async (id: string, newTitle: string) => {
    // Update locally first
    setConversations((prev) =>
      prev.map((conv) => (conv.id === id ? { ...conv, title: newTitle } : conv))
    );

    // Update on server for logged-in users
    if (user?.id) {
      try {
        await apiFetch("/api/conversations", {
          method: "PUT",
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

  // Delete conversation
  const deleteConversation = async (id: string) => {
    // Remove conversation from list
    setConversations((prev) => prev.filter((conv) => conv.id !== id));

    // Switch to another conversation if deleting active one
    if (id === activeConversationId) {
      if (conversations.length > 1) {
        // Find next conversation
        const remainingConversations = conversations.filter(
          (conv) => conv.id !== id
        );
        setActiveConversationId(remainingConversations[0].id);
      } else {
        createNewConversation();
      }
    }

    // Delete on server for logged-in users
    if (user?.id) {
      try {
        await apiFetch(`/api/conversations?id=${id}&userId=${user.id}`, {
          method: "DELETE",
        });
      } catch (error) {
        console.error("Error deleting conversation on server:", error);
      }
    }
  };

  // Switch conversation
  const switchConversation = (id: string) => {
    setActiveConversationId(id);
    // Navigate to conversation page
    if (!isHomePage) {
      router.push(`/chat/${id}`);
    }
  };

  // Update conversation history
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

  // Clear conversation
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
        return;
      }

      const exists = checkConversationExists(activeConversationId);

      // Only load if the conversation doesn't exist at all in our state
      if (!exists) {
        loadSpecificConversation(activeConversationId, user?.id);
        return;
      }

      // to the loadSpecificConversation function with its empty check tracking
    }
  }, [historyLoading, authChecked, activeConversationId, user?.id]);

  // Create a new conversation if none exist and we're not loading
  useEffect(() => {
    if (
      !historyLoading &&
      authChecked &&
      conversations.length === 0 &&
      !conversationId
    ) {
      createNewConversation();
    }
  }, [historyLoading, authChecked, conversations.length, conversationId]);

  // Handle "new" conversation creation
  useEffect(() => {
    if (conversationId === "new" && !historyLoading && authChecked) {
      createNewConversation();
    }
  }, [conversationId, historyLoading, authChecked]);

  // Load specific conversation by ID
  const loadSpecificConversation = async (
    conversationId: string,
    userId?: string
  ) => {
    // Don't load if we already checked this conversation was empty (prevents infinite loops)
    const checkedEmpty = sessionStorage.getItem(
      `checked-empty-${conversationId}`
    );
    if (checkedEmpty) {
      setHistoryLoading(false);
      return null;
    }

    // Set loading state
    setHistoryLoading(true);

    try {
      // First check if we already have this conversation in memory
      const existingConversation = conversations.find(
        (c) => c.id === conversationId
      );

      if (existingConversation) {
        // If conversation exists but has no history, check if we need to load from server
        if (
          (!existingConversation.history ||
            existingConversation.history.length === 0) &&
          user?.id
        ) {
          // Check server for history
        } else {
          // We have a valid memory conversation with history, use it
          setHistoryLoading(false);
          return existingConversation;
        }
      }

      // For authenticated users, fetch from server
      if (user?.id) {
        try {
          // Get user's access token
          const {
            data: { session },
          } = await supabase.auth.getSession();
          const accessToken = session?.access_token;

          if (!accessToken) {
            throw new Error("No access token available");
          }

          const response = await apiFetch(
            `/api/conversations?userId=${encodeURIComponent(
              user.id
            )}&conversationId=${encodeURIComponent(conversationId)}`,
            {}
          );

          if (!response.ok) {
            throw new Error(`Server returned ${response.status}`);
          }

          const data = await response.json();

          if (data.conversation) {
            // Ensure history is always an array
            data.conversation.history = data.conversation.history || [];

            // Convert server history format (userMessage/aiResponse) to client format (user/ai)
            const formattedHistory = data.conversation.history.map(
              (item: any) => {
                // Use utility function to determine longterm status
                const itemIsLongterm = isLongtermMemory(item);

                return {
                  user: item.userMessage,
                  ai: item.aiResponse,
                  isLongterm: itemIsLongterm,
                };
              }
            );

            const formattedConversation = {
              id: data.conversation.id,
              title: data.conversation.title || "New Conversation",
              created_at: data.conversation.created_at,
              updated_at: data.conversation.updated_at,
              history: formattedHistory, // Use the converted history format
            };

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
              sessionStorage.setItem(`checked-empty-${conversationId}`, "true");
            }

            return formattedConversation;
          } else {
            sessionStorage.setItem(`checked-empty-${conversationId}`, "true");
          }
        } catch (error) {
          console.error("Error fetching conversation from server:", error);
        }
      }

      setHistoryLoading(false);
      sessionStorage.setItem(`checked-empty-${conversationId}`, "true");
      return null;
    } catch (error) {
      setHistoryLoading(false);
      return null;
    }
  };

  return {
    conversations,
    setConversations,
    activeConversationId,
    setActiveConversationId,
    historyLoading,
    user,
    authChecked,
    getActiveConversation,
    createNewConversation,
    renameConversation,
    deleteConversation,
    switchConversation,
    updateConversationHistory,
    updateStreamingResponse,
    clearConversation,
    loadSpecificConversation,
  };
}
