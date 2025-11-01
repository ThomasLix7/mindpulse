"use client";
import { useRef, useEffect, useState } from "react";
import { Box, Button, Flex } from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import { useColorMode } from "@/components/ui/color-mode";

import { useCourses } from "@/hooks/useConversations";
import { useMemory } from "@/hooks/useMemory";
import { useChat } from "@/hooks/useChat";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { MessageList } from "@/components/chat/MessageList";
import { ChatInput } from "@/components/chat/ChatInput";
import { ChatProps } from "@/types/chat";
import { getCurrentUser, supabase } from "@/utils/supabase-client";
import { apiFetch } from "@/utils/api-fetch";

export default function ChatRefactored({
  courseId,
  learningPathId,
  isHomePage = false,
}: ChatProps) {
  const router = useRouter();

  // Auto-scroll ref
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Get or create course for learning path
  const [resolvedCourseId, setResolvedCourseId] = useState<string | undefined>(
    courseId
  );
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    const initUser = async () => {
      const { user } = await getCurrentUser();
      setCurrentUser(user);
    };
    initUser();
  }, []);

  useEffect(() => {
    const resolveCourse = async () => {
      if (courseId) {
        setResolvedCourseId(courseId);
        return;
      }

      if (learningPathId && !courseId && currentUser?.id) {
        try {
          // Get courses in this learning path
          const coursesResponse = await apiFetch(
            `/api/courses?userId=${currentUser.id}`
          );
          if (!coursesResponse.ok) return;

          const coursesData = await coursesResponse.json();
          const pathCourses = coursesData.courses?.filter(
            (c: any) => c.learning_path_id === learningPathId
          );

          if (pathCourses && pathCourses.length > 0) {
            // Sort by course_order and use the first course (lowest order)
            const sortedCourses = pathCourses.sort(
              (a: any, b: any) => (a.course_order || 0) - (b.course_order || 0)
            );
            setResolvedCourseId(sortedCourses[0].id);
          } else {
            // Create a default course
            const createResponse = await apiFetch("/api/courses", {
              method: "POST",
              body: JSON.stringify({
                userId: currentUser.id,
                title: "Main Course",
                learningPathId,
              }),
            });

            if (createResponse.ok) {
              const createData = await createResponse.json();
              if (createData.success && createData.course) {
                setResolvedCourseId(createData.course.id);
              }
            }
          }
        } catch (error) {
          console.error("Error resolving course for learning path:", error);
        }
      }
    };

    if (currentUser?.id) {
      resolveCourse();
    }
  }, [learningPathId, courseId, currentUser?.id]);

  // Custom hooks
  const {
    courses,
    setCourses,
    activeCourseId,
    historyLoading,
    user,
    authChecked,
    getActiveCourse,
    createNewCourse,
    renameCourse,
    clearCourse,
  } = useCourses(resolvedCourseId, isHomePage);

  const { savingToLongTerm, forgetFromLongTermMemory, saveToLongTermMemory } =
    useMemory({
      courses,
      setCourses,
      user,
    });

  const {
    input,
    setInput,
    loading,
    saveAsLongTerm,
    setSaveAsLongTerm,
    enableWebSearch,
    setEnableWebSearch,
    handleSubmit,
  } = useChat({
    courses,
    setCourses,
    activeCourseId,
    user,
    createNewCourse,
    updateCourseHistory: (id, userMessage, aiResponse) => {
      setCourses((prev) =>
        prev.map((course) => {
          if (course.id === id) {
            let updatedTitle = course.title;
            if (course.history.length === 0 && userMessage.length > 0) {
              updatedTitle =
                userMessage.substring(0, 30) +
                (userMessage.length > 30 ? "..." : "");
            }
            return {
              ...course,
              title: updatedTitle,
              history: [
                ...course.history,
                { user: userMessage, ai: aiResponse },
              ],
            };
          }
          return course;
        })
      );
    },
    updateStreamingResponse: (id, aiResponse) => {
      setCourses((prev) =>
        prev.map((course) => {
          if (course.id === id && course.history.length > 0) {
            const updatedHistory = [...course.history];
            const lastIndex = updatedHistory.length - 1;
            updatedHistory[lastIndex] = {
              user: updatedHistory[lastIndex].user,
              ai: aiResponse,
            };
            return { ...course, history: updatedHistory };
          }
          return course;
        })
      );
    },
    renameCourse,
    getActiveCourse,
    isHomePage,
  });

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    const activeCourse = getActiveCourse();
    if (chatContainerRef.current && activeCourse.history?.length > 0) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, [courses, activeCourseId, getActiveCourse]);

  const activeCourse = getActiveCourse();
  const { colorMode } = useColorMode();

  return (
    <Flex
      h="92vh"
      maxH="100vh"
      flexDirection="column"
      bg={colorMode === "dark" ? "gray.900" : "white"}
      color={colorMode === "dark" ? "white" : "black"}
      overflow="hidden"
      position="absolute"
      bottom={0}
      left={0}
      right={0}
    >
      {/* Chat Header */}
      <ChatHeader
        title={activeCourse.title}
        onTitleUpdate={(newTitle) => renameCourse(activeCourseId, newTitle)}
        onClearChat={clearCourse}
        hasHistory={activeCourse.history?.length > 0}
      />

      {/* Chat Content */}
      <Box
        position="relative"
        flex="1"
        overflowY="auto"
        overflowX="hidden"
        ref={chatContainerRef}
        minHeight={0}
      >
        {/* Mobile-only Chat Controls */}
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Button
            variant="outline"
            size="sm"
            colorScheme="blue"
            onClick={() => router.push("/mentor/new")}
            display={{ base: "inline-flex", md: "none" }}
            borderColor="gray.600"
            color="gray.200"
            _hover={{ bg: "gray.800" }}
          >
            New
          </Button>
        </Box>

        {/* Messages */}
        <Box px={4} pb={4}>
          <MessageList
            course={activeCourse}
            historyLoading={historyLoading}
            user={user}
            savingToLongTerm={savingToLongTerm}
            onSaveToMemory={saveToLongTermMemory}
            onForgetFromMemory={forgetFromLongTermMemory}
          />
        </Box>
      </Box>

      {/* Chat Input */}
      <ChatInput
        input={input}
        setInput={setInput}
        loading={loading}
        saveAsLongTerm={saveAsLongTerm}
        setSaveAsLongTerm={setSaveAsLongTerm}
        enableWebSearch={enableWebSearch}
        setEnableWebSearch={setEnableWebSearch}
        user={user}
        onSubmit={handleSubmit}
      />
    </Flex>
  );
}
