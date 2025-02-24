"use client";
import { useState } from "react";
import { Box, Input, Button, VStack, Text } from "@chakra-ui/react";

export default function Chat() {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<Array<{ user: string; ai: string }>>(
    []
  );
  const [currentAiResponse, setCurrentAiResponse] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const userMessage = input;
    setInput("");
    setHistory((prev) => [...prev, { user: userMessage, ai: "" }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          sessionId: "user-session",
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
          aiResponse += char;
          buffer = buffer.slice(1);

          // Use microtask timing for instant updates
          Promise.resolve().then(() => {
            setHistory((prev) => {
              const last = prev[prev.length - 1];
              return [
                ...prev.slice(0, -1),
                { user: last.user, ai: aiResponse },
              ];
            });
          });
        }
      }
    } catch (e) {
      console.error("Stream error:", e);
    }
  };

  return (
    <Box p={4} maxW="xl" margin="0 auto">
      <VStack gap={4} mb={4}>
        {history.map((entry, i) => (
          <Box key={i} w="100%">
            <Text fontWeight="bold">You: {entry.user}</Text>
            <Text>AI: {entry.ai}</Text>
          </Box>
        ))}
      </VStack>
      <form onSubmit={handleSubmit}>
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask me anything..."
          mb={2}
        />
        <Button type="submit" colorScheme="blue">
          Send
        </Button>
      </form>
    </Box>
  );
}
