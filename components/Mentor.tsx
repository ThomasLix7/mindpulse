"use client";
import { useRef, useEffect } from "react";
import { Box, Button, Flex } from "@chakra-ui/react";
import { useRouter } from "next/navigation";

import { useCourses } from "@/hooks/useConversations";
import { useMemory } from "@/hooks/useMemory";
import { useChat } from "@/hooks/useChat";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { MessageList } from "@/components/chat/MessageList";
import { ChatInput } from "@/components/chat/ChatInput";
import { ChatProps } from "@/types/chat";

export default function ChatRefactored({
  courseId,
  isHomePage = false,
}: ChatProps) {
  const router = useRouter();

  // Auto-scroll ref
  const chatContainerRef = useRef<HTMLDivElement>(null);

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
  } = useCourses(courseId, isHomePage);

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
              history: [...course.history, { user: userMessage, ai: aiResponse }],
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

  return (
    <Flex
      h="92vh"
      maxH="100vh"
      flexDirection="column"
      bg="black"
      color="white"
      overflow="hidden"
      position="absolute"
      bottom={0}
      left={0}
      right={0}
    >
      {/* Chat Header */}
      <ChatHeader
        title={activeCourse.title}
        onTitleUpdate={(newTitle) =>
          renameCourse(activeCourseId, newTitle)
        }
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
            onClick={() => router.push("/chat/new")}
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
