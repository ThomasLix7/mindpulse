"use client";

import { Box, Flex, Heading, Text } from "@chakra-ui/react";
import { useState, useEffect } from "react";
import { getCurrentUser, supabase } from "@/utils/supabase-client";
import { apiFetch } from "@/utils/api-fetch";
import CourseSidebar from "@/components/ConversationSidebar";
import { useRouter, usePathname } from "next/navigation";
import { useColorMode } from "@/components/ui/color-mode";

interface LearningPath {
  id: string;
  title: string;
  goal: string;
  created_at?: string;
  updated_at?: string;
}

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { colorMode } = useColorMode();
  const [user, setUser] = useState<any>(null);
  const [learningPaths, setLearningPaths] = useState<LearningPath[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load user and learning paths
  useEffect(() => {
    async function loadUserAndLearningPaths() {
      const { user } = await getCurrentUser();
      setUser(user);

      if (user?.id) {
        try {
          const response = await apiFetch(
            `/api/learning-paths?userId=${user.id}`,
            {
              method: "GET",
            }
          );

          if (response.ok) {
            const data = await response.json();
            if (data.success && data.learningPaths) {
              setLearningPaths(data.learningPaths);
            }
          }
        } catch (error) {
          console.error("Error loading learning paths:", error);
        }
      }

      setIsLoading(false);
    }

    loadUserAndLearningPaths();

    // Listen for learning path creation events
    const handleNewLearningPath = (event: any) => {
      setLearningPaths((prev) => {
        if (prev.some((path: any) => path.id === event.detail.id)) {
          return prev;
        }
        return [event.detail, ...prev];
      });
    };

    window.addEventListener("learning-path-created", handleNewLearningPath);

    return () => {
      window.removeEventListener("learning-path-created", handleNewLearningPath);
    };
  }, []);

  // Handle learning path deletion
  const deleteLearningPath = async (id: string) => {
    const currentPathId = pathname.split("/").pop();
    const isOnPathRoute = id === currentPathId;
    
    // Check if user is on a course route that belongs to this learning path
    let isOnCourseRoute = false;
    if (user?.id && currentPathId && !isOnPathRoute) {
      try {
        // Check if current ID is a course that belongs to this learning path
        const coursesResponse = await apiFetch(`/api/courses?userId=${user.id}&courseId=${currentPathId}`);
        if (coursesResponse.ok) {
          const coursesData = await coursesResponse.json();
          if (coursesData.success && coursesData.course?.learning_path_id === id) {
            isOnCourseRoute = true;
          }
        }
      } catch (error) {
        console.error("Error checking course:", error);
      }
    }

    const currentPaths = [...learningPaths];
    setLearningPaths((prev) => prev.filter((path) => path.id !== id));

    if (user?.id) {
      try {
        await apiFetch(
          `/api/learning-paths?learningPathId=${id}&userId=${user.id}`,
          {
            method: "DELETE",
          }
        );
      } catch (error) {
        console.error("Error deleting learning path on server:", error);
      }
    }

    // Redirect if user is on the deleted learning path or one of its courses
    if (isOnPathRoute || isOnCourseRoute) {
      const remainingPaths = currentPaths.filter((path) => path.id !== id);
      if (remainingPaths.length > 0) {
        router.push(`/mentor/${remainingPaths[0].id}`);
      } else {
        router.push("/mentor");
      }
    }
  };

  return (
    <Flex
      position="fixed"
      top="64px"
      left="0"
      right="0"
      bottom="0"
      bg={colorMode === "dark" ? "gray.900" : "white"}
      color={colorMode === "dark" ? "white" : "black"}
      overflow="hidden"
      className="chat-layout-container"
    >
      {/* Persistent Sidebar */}
      <CourseSidebar
        learningPaths={learningPaths}
        isLoading={isLoading}
        userId={user?.id}
        onDeleteLearningPath={deleteLearningPath}
      />

      {/* Main Content */}
      <Box flex="1" overflow="auto" h="100%" position="relative">
        <Box padding={0} height="100%" overflowY="auto">
          {children}
        </Box>
      </Box>
    </Flex>
  );
}
