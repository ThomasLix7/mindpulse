import { useState } from "react";
import { Conversation } from "@/types/chat";

function isLongtermMemory(item: any): boolean {
  return Boolean(
    item.is_longterm === true ||
      item.metadata?.isLongterm === true ||
      item.isLongterm === true
  );
}

interface UseMemoryProps {
  conversations: Conversation[];
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>;
  user: any;
}

export function useMemory({
  conversations,
  setConversations,
  user,
}: UseMemoryProps) {
  const [savingToLongTerm, setSavingToLongTerm] = useState<number | null>(null);

  // Forget from long-term memory
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

    // Set the saving indicator
    setSavingToLongTerm(messageIndex);

    try {
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

      if (!findMemoryResponse.ok) {
        const errorData = await findMemoryResponse.json();

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

      if (!findData.memoryId) {
        alert("Could not find the memory for this message");
        return;
      }

      // Use the memory endpoint to forget it, passing params as URL query params
      // Important: Use URL parameters for DELETE instead of body
      const deleteUrl = `/api/memory?userId=${encodeURIComponent(
        user.id
      )}&memoryId=${encodeURIComponent(findData.memoryId)}`;

      const response = await fetch(deleteUrl, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });

      // Handle response
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
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

                return { ...conv, history: updatedHistory };
              }
              return conv;
            })
          );
        } else {
          alert(
            `Failed to remove: ${data.error || "Unknown error"}${
              data.details ? ` - ${data.details}` : ""
            }`
          );
        }
      } else {
        try {
          const errorData = await response.json();
          alert(
            `Failed to remove: ${errorData.error || "Unknown error"}${
              errorData.details ? ` - ${errorData.details}` : ""
            }`
          );
        } catch (jsonError) {
          alert(
            `Failed to remove from long-term memory: Error status ${response.status}`
          );
        }
      }
    } catch (error) {
      alert(
        `Failed to remove from long-term memory: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    } finally {
      setSavingToLongTerm(null);
    }
  };

  // Save to long-term memory
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

    // Set the saving indicator
    setSavingToLongTerm(messageIndex);

    try {
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

      if (!findMemoryResponse.ok) {
        const errorData = await findMemoryResponse.json();

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

      if (!findData.memoryId) {
        alert("Could not find the memory for this message");
        return;
      }

      // Use the memory endpoint to promote it
      const response = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memoryId: findData.memoryId,
          userId: user.id,
        }),
      });

      // Handle response
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
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

                return { ...conv, history: updatedHistory };
              }
              return conv;
            })
          );
        } else {
          alert(
            `Failed to save: ${data.error || "Unknown error"}${
              data.details ? ` - ${data.details}` : ""
            }`
          );
        }
      } else {
        try {
          const errorData = await response.json();
          // Handle the case where errorData might be empty
          if (errorData && Object.keys(errorData).length > 0) {
            alert(
              `Failed to save: ${errorData.error || "Unknown error"}${
                errorData.details ? ` - ${errorData.details}` : ""
              }`
            );
          } else {
            alert(
              `Failed to save to long-term memory: Empty error response (status ${response.status})`
            );
          }
        } catch (jsonError) {
          alert(
            `Failed to save to long-term memory: Error status ${response.status}`
          );
        }
      }
    } catch (error) {
      alert(
        `Failed to save to long-term memory: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    } finally {
      setSavingToLongTerm(null);
    }
  };

  return {
    savingToLongTerm,
    forgetFromLongTermMemory,
    saveToLongTermMemory,
    isLongtermMemory,
  };
}
