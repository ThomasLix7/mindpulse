"use client";

import { Box, Flex } from "@chakra-ui/react";
import { useState, useEffect } from "react";
import { getCurrentUser } from "@/utils/supabase-client";
import { apiFetch } from "@/utils/api-fetch";
import CourseSidebar from "@/components/ConversationSidebar";
import { useRouter, usePathname } from "next/navigation";
import { useColorMode } from "@/components/ui/color-mode";
import { LearningDataProvider, useLearningData } from "./LearningDataContext";

interface LearningPath {
  id: string;
  title: string;
  goal: string;
  created_at?: string;
  updated_at?: string;
}

function ChatLayoutInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { colorMode } = useColorMode();
  const [user, setUser] = useState<any>(null);
  const { learningPaths, courses, isLoading, refreshData } = useLearningData();

  useEffect(() => {
    async function loadUser() {
      const { user } = await getCurrentUser();
      setUser(user);
    }
    loadUser();
  }, []);

  // Handle learning path deletion
  const deleteLearningPath = async (id: string) => {
    const currentPathId = pathname.split("/").pop();
    const isOnPathRoute = id === currentPathId;

    // Check if user is on a course route that belongs to this learning path
    let isOnCourseRoute = false;
    if (currentPathId && !isOnPathRoute && courses.length > 0) {
      const currentCourse = courses.find((c: any) => c.id === currentPathId);
      if (currentCourse && (currentCourse as any).learning_path_id === id) {
        isOnCourseRoute = true;
      }
    }

    const currentPaths = [...learningPaths];

    if (user?.id) {
      try {
        await apiFetch(
          `/api/learning-paths?learningPathId=${id}&userId=${user.id}`,
          {
            method: "DELETE",
          }
        );
        await refreshData();
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
        courses={courses}
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

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <LearningDataProvider>
      <ChatLayoutInner>{children}</ChatLayoutInner>
    </LearningDataProvider>
  );
}
