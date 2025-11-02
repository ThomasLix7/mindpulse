"use client";
import { useRef, useEffect, useState, useMemo } from "react";
import { Box, Button, Flex } from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import { useColorMode } from "@/components/ui/color-mode";

import { useCourses } from "@/hooks/useConversations";
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
  const chatContainerRef = useRef<HTMLDivElement>(null);
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
          const coursesResponse = await apiFetch(
            `/api/courses?userId=${currentUser.id}`
          );
          if (!coursesResponse.ok) return;

          const coursesData = await coursesResponse.json();
          const pathCourses = coursesData.courses?.filter(
            (c: any) => c.learning_path_id === learningPathId
          );

          if (pathCourses && pathCourses.length > 0) {
            const sortedCourses = pathCourses.sort(
              (a: any, b: any) => (a.course_order || 0) - (b.course_order || 0)
            );
            setResolvedCourseId(sortedCourses[0].id);
          } else {
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

  const {
    courses,
    setCourses,
    activeCourseId,
    historyLoading,
    user,
    authChecked,
    getActiveCourse,
    createNewCourse,
  } = useCourses(resolvedCourseId, isHomePage);

  const {
    input,
    setInput,
    loading,
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
    getActiveCourse,
    isHomePage,
  });

  const greetingCheckedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (
      !activeCourseId ||
      activeCourseId === "new" ||
      !authChecked ||
      historyLoading ||
      loading ||
      !user?.id
    ) {
      return;
    }

    if (greetingCheckedRef.current.has(activeCourseId)) {
      return;
    }

    const activeCourse = getActiveCourse();

    if (!activeCourse || activeCourse.id !== activeCourseId) {
      return;
    }

    // Send greeting for new course or continue summary for existing
    const hasHistory = activeCourse.history && activeCourse.history.length > 0;
    greetingCheckedRef.current.add(activeCourseId);

    const sendInitialMessage = async () => {
      try {
        const res = await apiFetch("/api/chat", {
          method: "POST",
          body: JSON.stringify({
            message: hasHistory ? "__CONTINUE__" : "__GREETING__",
            courseId: activeCourseId,
            userId: user.id,
            isLongTerm: false,
            enableWebSearch: false,
          }),
        });

        if (!res.ok) {
          throw new Error(`API responded with status: ${res.status}`);
        }

        const reader = res.body?.getReader();
        if (!reader) {
          throw new Error("Response body reader could not be created");
        }

        const decoder = new TextDecoder();
        let aiResponse = "";
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          while (buffer.length > 0) {
            const char = buffer[0];
            buffer = buffer.slice(1);

            if (char === "d" && buffer.startsWith("ata: ")) {
              buffer = buffer.slice(5);
              const endIndex = buffer.indexOf("\n\n");
              if (endIndex === -1) continue;

              const jsonStr = buffer.slice(0, endIndex);
              buffer = buffer.slice(endIndex + 2);

              try {
                const data = JSON.parse(jsonStr);
                aiResponse += data.text;
                setCourses((prev) =>
                  prev.map((course) => {
                    if (course.id === activeCourseId) {
                      const lastMsg = course.history[course.history.length - 1];
                      // Update existing message or create new one on first chunk
                      if (lastMsg && lastMsg.user === "" && lastMsg.ai) {
                        const updatedHistory = [...course.history];
                        updatedHistory[updatedHistory.length - 1] = {
                          user: "",
                          ai: aiResponse,
                        };
                        return { ...course, history: updatedHistory };
                      } else {
                        return {
                          ...course,
                          history: [
                            ...course.history,
                            { user: "", ai: aiResponse },
                          ],
                        };
                      }
                    }
                    return course;
                  })
                );
              } catch (e) {
                console.error("JSON parse error:", e);
              }
            }
          }
        }
      } catch (error) {
        console.error("Error sending initial message:", error);
        greetingCheckedRef.current.delete(activeCourseId);
      }
    };

    sendInitialMessage();
  }, [
    activeCourseId,
    authChecked,
    historyLoading,
    loading,
    user?.id,
    getActiveCourse,
    setCourses,
  ]);

  useEffect(() => {
    const activeCourse = getActiveCourse();
    if (chatContainerRef.current && activeCourse.history?.length > 0) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, [courses, activeCourseId, getActiveCourse]);

  const activeCourse = getActiveCourse();
  const { colorMode } = useColorMode();
  const [learningPathInfo, setLearningPathInfo] = useState<{
    title: string;
    courseOrder: number;
  } | null>(null);

  useEffect(() => {
    const fetchLearningPathInfo = async () => {
      if (!activeCourseId || !user?.id) return;

      try {
        const response = await apiFetch(
          `/api/courses?userId=${user.id}&courseId=${activeCourseId}`
        );
        if (response.ok) {
          const data = await response.json();
          if (data.course?.learning_path_id) {
            const pathResponse = await apiFetch(
              `/api/learning-paths?userId=${user.id}&learningPathId=${data.course.learning_path_id}`
            );
            if (pathResponse.ok) {
              const pathData = await pathResponse.json();
              if (pathData.learningPath) {
                setLearningPathInfo({
                  title: pathData.learningPath.title,
                  courseOrder: data.course.course_order || 0,
                });
                return;
              }
            }
          }
        }
        setLearningPathInfo(null);
      } catch (error) {
        console.error("Error fetching learning path info:", error);
        setLearningPathInfo(null);
      }
    };

    fetchLearningPathInfo();
  }, [activeCourseId, user?.id]);

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
      <ChatHeader
        title={activeCourse.title}
        learningPathTitle={learningPathInfo?.title}
        courseOrder={learningPathInfo?.courseOrder}
      />

      <Box
        position="relative"
        flex="1"
        overflowY="auto"
        overflowX="hidden"
        ref={chatContainerRef}
        minHeight={0}
      >
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

        <Box px={4} pb={4}>
          <MessageList
            course={activeCourse}
            historyLoading={historyLoading}
            user={user}
          />
        </Box>
      </Box>

      <ChatInput
        input={input}
        setInput={setInput}
        loading={loading}
        enableWebSearch={enableWebSearch}
        setEnableWebSearch={setEnableWebSearch}
        user={user}
        onSubmit={handleSubmit}
      />
    </Flex>
  );
}
