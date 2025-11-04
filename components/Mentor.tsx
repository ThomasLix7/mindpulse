"use client";
import { useRef, useEffect, useState, useMemo, useCallback } from "react";
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

  const greetingCheckedRef = useRef<Set<string>>(new Set());
  const isSendingRef = useRef(false);
  const updateTimeoutRef = useRef<number | null>(null);
  const pendingUpdateRef = useRef<{ id: string; text: string } | null>(null);
  const isUpdatingRef = useRef(false);

  useEffect(() => {
    const resolveCourse = async () => {
      if (courseId) {
        setResolvedCourseId(courseId);
        return;
      }

      if (learningPathId && !courseId && currentUser?.id) {
        if (courses.length > 0) {
          const pathCourses = courses.filter(
            (c: any) => (c as any).learning_path_id === learningPathId
          );
          if (pathCourses.length > 0) {
            const sortedCourses = pathCourses.sort(
              (a: any, b: any) =>
                ((a as any).course_order || 0) - ((b as any).course_order || 0)
            );
            setResolvedCourseId(sortedCourses[0].id);
            return;
          }
        }
      }
    };

    if (currentUser?.id) {
      resolveCourse();
    }
  }, [learningPathId, courseId, currentUser?.id, courses]);

  const updateStreamingResponse = useCallback(
    (id: string, aiResponse: string) => {
      pendingUpdateRef.current = { id, text: aiResponse };

      if (isUpdatingRef.current) {
        return;
      }

      const processUpdate = () => {
        const pending = pendingUpdateRef.current;
        if (!pending) {
          isUpdatingRef.current = false;
          return;
        }

        const pendingText = pending.text;
        const pendingId = pending.id;

        // Clear the ref first so new updates can be set while we process
        pendingUpdateRef.current = null;

        setCourses((prev) =>
          prev.map((course) => {
            if (course.id === pendingId) {
              const updatedHistory = [...course.history];
              const lastIndex = updatedHistory.length - 1;
              if (lastIndex >= 0) {
                updatedHistory[lastIndex] = {
                  ...updatedHistory[lastIndex],
                  ai: pendingText,
                };
              } else {
                updatedHistory.push({ user: "", ai: pendingText });
              }
              return { ...course, history: updatedHistory };
            }
            return course;
          })
        );

        // Check if there's a new pending update that came in while processing
        isUpdatingRef.current = false;

        const nextPending = pendingUpdateRef.current as {
          id: string;
          text: string;
        } | null;
        if (nextPending !== null && nextPending.id === pendingId) {
          isUpdatingRef.current = true;
          updateTimeoutRef.current = requestAnimationFrame(processUpdate);
        }
      };

      if (updateTimeoutRef.current) {
        cancelAnimationFrame(updateTimeoutRef.current);
      }

      isUpdatingRef.current = true;
      updateTimeoutRef.current = requestAnimationFrame(processUpdate);
    },
    [setCourses]
  );

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
    updateCourseHistory: useCallback(
      (id: string, userMessage: string, aiResponse: string) => {
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
      [setCourses]
    ),
    updateStreamingResponse,
    getActiveCourse,
    isHomePage,
  });

  useEffect(() => {
    if (
      !activeCourseId ||
      activeCourseId === "new" ||
      !authChecked ||
      historyLoading ||
      !user?.id ||
      isSendingRef.current
    ) {
      return;
    }

    if (greetingCheckedRef.current.has(activeCourseId)) {
      return;
    }

    const activeCourse = courses.find((c) => c.id === activeCourseId);

    if (!activeCourse) {
      return;
    }

    if (loading) {
      return;
    }

    // Send greeting for new course or continue summary for existing
    const hasHistory = activeCourse.history && activeCourse.history.length > 0;
    greetingCheckedRef.current.add(activeCourseId);
    isSendingRef.current = true;

    const sendInitialMessage = async () => {
      const currentCourseId = activeCourseId;
      const currentUserId = user.id;
      let messageCreated = false;

      try {
        const res = await apiFetch("/api/chat", {
          method: "POST",
          body: JSON.stringify({
            message: hasHistory ? "__CONTINUE__" : "__GREETING__",
            courseId: currentCourseId,
            userId: currentUserId,
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
        let pendingChars = "";
        let updateTimer: ReturnType<typeof setTimeout> | null = null;

        const flushPending = () => {
          if (pendingChars) {
            aiResponse += pendingChars;
            pendingChars = "";

            if (!messageCreated) {
              setCourses((prev) =>
                prev.map((course) => {
                  if (course.id === currentCourseId) {
                    return {
                      ...course,
                      history: [...course.history, { user: "", ai: "" }],
                    };
                  }
                  return course;
                })
              );
              messageCreated = true;
            }

            if (updateTimeoutRef.current) {
              cancelAnimationFrame(updateTimeoutRef.current);
            }
            updateTimeoutRef.current = requestAnimationFrame(() => {
              setCourses((prev) =>
                prev.map((course) => {
                  if (
                    course.id === currentCourseId &&
                    course.history.length > 0
                  ) {
                    const updatedHistory = [...course.history];
                    const lastIndex = updatedHistory.length - 1;
                    updatedHistory[lastIndex] = {
                      user: "",
                      ai: aiResponse,
                    };
                    return { ...course, history: updatedHistory };
                  }
                  return course;
                })
              );
            });
          }
          if (updateTimer) {
            clearTimeout(updateTimer);
            updateTimer = null;
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            flushPending();
            break;
          }

          buffer += decoder.decode(value, { stream: true });

          // Process SSE format: look for "data: " lines
          let dataIndex = buffer.indexOf("data: ");
          while (dataIndex !== -1) {
            // Extract everything after "data: "
            const afterData = buffer.slice(dataIndex + 6);
            const endIndex = afterData.indexOf("\n\n");

            if (endIndex === -1) {
              // Need more data, keep the buffer from "data: " onwards
              buffer = buffer.slice(dataIndex);
              break;
            }

            const jsonStr = afterData.slice(0, endIndex).trim();
            buffer = buffer.slice(dataIndex + 6 + endIndex + 2);

            try {
              const data = JSON.parse(jsonStr);
              if (data.text) {
                pendingChars += data.text;

                // Batch updates: flush every 15 characters or after 100ms for smoother streaming
                if (pendingChars.length >= 15) {
                  flushPending();
                } else if (!updateTimer) {
                  updateTimer = setTimeout(flushPending, 100);
                }
              }
            } catch (e) {
              console.error("JSON parse error:", e);
            }

            dataIndex = buffer.indexOf("data: ");
          }
        }
      } catch (error) {
        console.error("Error sending initial message:", error);
        greetingCheckedRef.current.delete(currentCourseId);
      } finally {
        if (updateTimeoutRef.current) {
          cancelAnimationFrame(updateTimeoutRef.current);
        }
        isSendingRef.current = false;
      }
    };

    sendInitialMessage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCourseId, authChecked, historyLoading, user?.id]);

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
    if (!activeCourseId || !courses.length) {
      setLearningPathInfo(null);
      return;
    }

    const activeCourse = courses.find((c) => c.id === activeCourseId) as any;
    if (activeCourse) {
      setLearningPathInfo({
        title: activeCourse.learning_path_id || "",
        courseOrder: activeCourse.course_order || 0,
      });
    } else {
      setLearningPathInfo(null);
    }
  }, [activeCourseId, courses]);

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
          <MessageList course={activeCourse} historyLoading={historyLoading} />
        </Box>
      </Box>

      <ChatInput
        input={input}
        setInput={setInput}
        loading={loading}
        enableWebSearch={enableWebSearch}
        setEnableWebSearch={setEnableWebSearch}
        onSubmit={handleSubmit}
      />
    </Flex>
  );
}
