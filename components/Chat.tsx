"use client";
import { useState } from "react";
import { Box, Input, Button, VStack, Text } from "@chakra-ui/react";

export default function Chat() {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<Array<{ user: string; ai: string }>>(
    []
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Add temporary message immediately
    setHistory([...history, { user: input, ai: "..." }]);

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: input,
        sessionId: "user-session",
        messages: history.map((m) => ({
          // Send chat history
          role: "user",
          content: m.user,
        })),
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Failed to fetch");
    }
    const text = data.text || "No response from AI";

    // Update last message with actual response
    setHistory((prev) => {
      const newHistory = [...prev];
      newHistory[newHistory.length - 1].ai = text;
      return newHistory;
    });
    setInput("");
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
