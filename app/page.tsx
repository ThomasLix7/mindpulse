"use client";

import { Box, Heading, Text } from "@chakra-ui/react";
import Chat from "@/components/Chat";

export default function Home() {
  return (
    <Box p={8}>
      <Heading>Welcome to MindPulse AI Assistant</Heading>
      <Text mt={4} mb={8}>
        Conversational AI with contextual memory
      </Text>

      <Box borderWidth="1px" borderRadius="lg" p={6} boxShadow="md">
        <Chat />
      </Box>
    </Box>
  );
}
