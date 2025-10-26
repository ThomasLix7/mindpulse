import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "@/utils/supabase-client";

interface UseChatProps {
  conversations: any[];
  setConversations: React.Dispatch<React.SetStateAction<any[]>>;
  activeConversationId: string;
  user: any;
  createNewConversation: () => Promise<string | null>;
  updateConversationHistory: (
    id: string,
    userMessage: string,
    aiResponse: string
  ) => void;
  updateStreamingResponse: (id: string, aiResponse: string) => void;
  renameConversation: (id: string, newTitle: string) => Promise<void>;
  getActiveConversation: () => any;
  isHomePage?: boolean;
}

export function useChat({
  conversations,
  setConversations,
  activeConversationId,
  user,
  createNewConversation,
  updateConversationHistory,
  updateStreamingResponse,
  renameConversation,
  getActiveConversation,
  isHomePage = false,
}: UseChatProps) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [saveAsLongTerm, setSaveAsLongTerm] = useState(false);
  const [enableWebSearch, setEnableWebSearch] = useState<boolean>(false);
  const router = useRouter();

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
    // Reset to a new anonymous session
    createNewConversation();
    router.push("/login");
  };

  const handleLogin = () => {
    router.push("/login");
  };

  return {
    input,
    setInput,
    loading,
    saveAsLongTerm,
    setSaveAsLongTerm,
    enableWebSearch,
    setEnableWebSearch,
    handleSubmit,
    handleLogout,
    handleLogin,
  };
}
