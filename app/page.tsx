"use client";

import { Box, Heading, Text } from "@chakra-ui/react";
import Chat from "@/components/Chat";
import DatabaseSetup from "@/components/DatabaseSetup";
import { useState, useEffect } from "react";
import { getCurrentUser } from "@/utils/supabase-client";

export default function Home() {
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Check if user is logged in and if they are an admin
  useEffect(() => {
    const checkUser = async () => {
      const { user } = await getCurrentUser();
      setUser(user);

      // For development purposes, consider the first user who logs in as an admin
      // In production, you would check for a specific role or email
      if (user && user.email) {
        // You can define admin users by their email or other criteria
        const adminEmails = ["admin@example.com"]; // Replace with your admin email
        setIsAdmin(adminEmails.includes(user.email));
      }
    };

    checkUser();
  }, []);

  return (
    <Box padding={8}>
      <Heading>Welcome to MindPulse AI Assistant</Heading>
      <Text marginTop={4} marginBottom={8}>
        Conversational AI with contextual memory
      </Text>

      {/* Show the database setup component only to admin users */}
      {isAdmin && <DatabaseSetup />}

      <Box borderWidth="1px" borderRadius="lg" padding={6} boxShadow="md">
        <Chat />
      </Box>
    </Box>
  );
}
