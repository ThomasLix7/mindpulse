"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Heading, Text, Button, VStack, Spinner } from "@chakra-ui/react";
import { getCurrentUser, supabase } from "@/utils/supabase-client";
import { apiFetch } from "@/utils/api-fetch";
import { useColorMode } from "@/components/ui/color-mode";
import LearningPathForm, {
  LearningPathFormData,
} from "@/components/LearningPathForm";

export default function ChatDefaultPage() {
  const { colorMode } = useColorMode();
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const router = useRouter();

  // Check authentication status
  useEffect(() => {
    const checkAuth = async () => {
      const { user: currentUser } = await getCurrentUser();
      setUser(currentUser);

      // Redirect to login if not authenticated
      if (!currentUser?.id) {
        router.push("/login");
        return;
      }

      setIsLoading(false);
    };

    checkAuth();
  }, [router]);

  // Create new learning path from form data
  const handleCreateLearningPath = async (formData: LearningPathFormData) => {
    if (!user?.id) {
      console.error("User not authenticated");
      router.push("/login");
      return;
    }

    setIsFormOpen(false);
    setIsCreating(true);

    try {
      const response = await apiFetch("/api/learning-paths", {
        method: "POST",
        body: JSON.stringify({
          userId: user.id,
          ...formData,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.learningPath) {
          // Dispatch event for layout to update sidebar
          window.dispatchEvent(
            new CustomEvent("learning-path-created", {
              detail: data.learningPath,
            })
          );
          // Navigate to the new learning path
          router.push(`/mentor/${data.learningPath.id}`);
        }
      } else {
        const errorData = await response.json();
        console.error("Failed to create learning path:", errorData.error);
        if (response.status === 401) {
          router.push("/login");
        }
      }
    } catch (error) {
      console.error("Error creating learning path:", error);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Box h="100%" p={8} className="chat-page-container">
      {isCreating ? (
        <VStack gap={8} align="center" justify="center" h="100%">
          <Spinner size="xl" color="blue.500" thickness="4px" />
          <VStack gap={2} align="center">
            <Heading
              size="lg"
              fontWeight="bold"
              color={colorMode === "dark" ? "white" : "black"}
              textAlign="center"
            >
              Creating Your Learning Path
            </Heading>
            <Text
              fontSize="md"
              color="gray.500"
              textAlign="center"
              maxW="lg"
            >
              Generating your personalized curriculum... This may take a moment.
            </Text>
          </VStack>
        </VStack>
      ) : (
        <VStack gap={8} align="center" justify="center" h="100%">
          <VStack gap={4} align="center">
            <Heading
              size="2xl"
              fontWeight="bold"
              color={colorMode === "dark" ? "white" : "black"}
              textAlign="center"
            >
              Welcome to MindPulse
            </Heading>

            <Text
              fontSize="lg"
              color="gray.500"
              textAlign="center"
              maxW="lg"
              lineHeight="tall"
            >
              Your AI tutor is waiting. Let's start a learning path.
            </Text>
          </VStack>

          <Button
            colorScheme="blue"
            onClick={() => setIsFormOpen(true)}
            size="lg"
            px={8}
            py={6}
            fontSize="lg"
            fontWeight="semibold"
            borderRadius="xl"
            _hover={{
              transform: "translateY(-2px)",
              boxShadow: "lg",
            }}
            transition="all 0.2s"
          >
            Start New Learning Path
          </Button>

          {isLoading && <Text color="gray.400">Loading...</Text>}
        </VStack>
      )}

      <LearningPathForm
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSubmit={handleCreateLearningPath}
        isLoading={isCreating}
      />
    </Box>
  );
}
