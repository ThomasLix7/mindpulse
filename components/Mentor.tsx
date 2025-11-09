"use client";
import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import { Box, Button, Flex, Text } from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import { useColorMode } from "@/components/ui/color-mode";

import { useCourses } from "@/hooks/useCourses";
import { useChat } from "@/hooks/useChat";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { MessageList } from "@/components/chat/MessageList";
import { ChatInput } from "@/components/chat/ChatInput";
import { AssessmentModal } from "@/components/AssessmentModal";
import { AssessmentResultModal } from "@/components/AssessmentResultModal";
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
  const [assessmentModalOpen, setAssessmentModalOpen] = useState(false);
  const [currentAssessmentId, setCurrentAssessmentId] = useState<string | null>(
    null
  );
  const [assessmentReadyTopic, setAssessmentReadyTopic] = useState<
    string | null
  >(null);
  const [generatingAssessment, setGeneratingAssessment] = useState(false);
  const [inProgressAssessmentId, setInProgressAssessmentId] = useState<
    string | null
  >(null);
  const [inProgressAssessmentTopic, setInProgressAssessmentTopic] = useState<
    string | null
  >(null);
  const [resultModalOpen, setResultModalOpen] = useState(false);
  const [assessmentResults, setAssessmentResults] = useState<any>(null);
  const [resultAssessmentId, setResultAssessmentId] = useState<string | null>(
    null
  );
  const [completedAssessmentId, setCompletedAssessmentId] = useState<
    string | null
  >(null);

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

  // Assessment events
  useEffect(() => {
    const handleAssessmentReadySignal = (event: CustomEvent) => {
      const { topic } = event.detail;
      setAssessmentReadyTopic(topic);

      if (activeCourseId) {
        setCourses((prev) =>
          prev.map((course) => {
            if (course.id === activeCourseId) {
              return {
                ...course,
                metadata: {
                  ...(course as any).metadata,
                  pending_assessment_topic: topic,
                },
              };
            }
            return course;
          })
        );
      }
    };

    const handleAssessmentReady = (event: CustomEvent) => {
      const { assessmentId } = event.detail;
      setCurrentAssessmentId(assessmentId);
      setAssessmentModalOpen(true);
      setAssessmentReadyTopic(null);
    };

    window.addEventListener(
      "assessmentReadySignal",
      handleAssessmentReadySignal as EventListener
    );
    window.addEventListener(
      "assessmentReady",
      handleAssessmentReady as EventListener
    );
    return () => {
      window.removeEventListener(
        "assessmentReadySignal",
        handleAssessmentReadySignal as EventListener
      );
      window.removeEventListener(
        "assessmentReady",
        handleAssessmentReady as EventListener
      );
    };
  }, [activeCourseId, setCourses]);

  const handleStartAssessment = async () => {
    if (!activeCourseId || !user?.id || !assessmentReadyTopic) return;

    const activeCourse = getActiveCourse();
    const courseData = courses.find((c: any) => c.id === activeCourseId) as any;
    const lessonIndex = courseData?.current_lesson_index ?? 0;
    const topicIndex = courseData?.current_topic_index ?? 0;
    const lessons = courseData?.curriculum?.lessons || [];
    const currentLesson = lessons[lessonIndex];

    setGeneratingAssessment(true);
    setCurrentAssessmentId("generating");
    setAssessmentModalOpen(true);
    try {
      const response = await apiFetch("/api/assessments/generate", {
        method: "POST",
        body: JSON.stringify({
          courseId: activeCourseId,
          userId: user.id,
          topic: assessmentReadyTopic,
          lessonTitle: currentLesson?.title || activeCourse.title,
          lessonIndex,
          topicIndex,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setCurrentAssessmentId(data.assessmentId);
        setInProgressAssessmentId(data.assessmentId);
        setInProgressAssessmentTopic(assessmentReadyTopic);
        setAssessmentModalOpen(true);
        setAssessmentReadyTopic(null);

        setCourses((prev) =>
          prev.map((course) => {
            if (course.id === activeCourseId) {
              const metadata = (course as any).metadata || {};
              const {
                pending_assessment_topic,
                pending_assessment_lesson_index,
                pending_assessment_topic_index,
                ...cleanedMetadata
              } = metadata;
              return {
                ...course,
                metadata: {
                  ...cleanedMetadata,
                  in_progress_assessment_id: data.assessmentId,
                  in_progress_assessment_topic: assessmentReadyTopic,
                },
              };
            }
            return course;
          })
        );
      } else {
        const errorData = await response.json();
        if (response.status === 409 && errorData.existingAssessmentId) {
          setCurrentAssessmentId(errorData.existingAssessmentId);
          setInProgressAssessmentId(errorData.existingAssessmentId);
          setInProgressAssessmentTopic(assessmentReadyTopic);
          setAssessmentModalOpen(true);
          setAssessmentReadyTopic(null);
        } else {
          console.error("Failed to generate assessment:", errorData.error);
        }
      }
    } catch (error) {
      console.error("Error generating assessment:", error);
    } finally {
      setGeneratingAssessment(false);
    }
  };

  useEffect(() => {
    if (!activeCourseId || !courses.length || !user?.id || !authChecked) return;

    const checkAssessments = async () => {
      const activeCourse = courses.find(
        (c: any) => c.id === activeCourseId
      ) as any;

      if (!activeCourse) return;

      const inProgressId = activeCourse?.metadata?.in_progress_assessment_id;
      const inProgressTopic =
        activeCourse?.metadata?.in_progress_assessment_topic;

      if (inProgressId) {
        setCurrentAssessmentId(inProgressId);
        setInProgressAssessmentId(inProgressId);
        setInProgressAssessmentTopic(inProgressTopic || null);
        setAssessmentReadyTopic(null);
      } else if (
        activeCourse.metadata !== undefined &&
        activeCourse.metadata !== null
      ) {
        setInProgressAssessmentId(null);
        setInProgressAssessmentTopic(null);
      }

      if (!inProgressId && activeCourse?.metadata?.pending_assessment_topic) {
        setAssessmentReadyTopic(activeCourse.metadata.pending_assessment_topic);
      }

      const completedId = activeCourse?.metadata?.completed_assessment_id;
      if (completedId) {
        setCompletedAssessmentId(completedId);
      }
    };

    checkAssessments();
  }, [activeCourseId, courses, user?.id, authChecked]);

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

    // Don't send continue message if there's an in-progress assessment
    // (assessment result message will be sent instead)
    if (inProgressAssessmentId || currentAssessmentId) {
      return;
    }

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

          let dataIndex = buffer.indexOf("data: ");
          while (dataIndex !== -1) {
            const afterData = buffer.slice(dataIndex + 6);
            const endIndex = afterData.indexOf("\n\n");

            if (endIndex === -1) {
              buffer = buffer.slice(dataIndex);
              break;
            }

            const jsonStr = afterData.slice(0, endIndex).trim();
            buffer = buffer.slice(dataIndex + 6 + endIndex + 2);

            try {
              const data = JSON.parse(jsonStr);
              if (data.text) {
                pendingChars += data.text;

                if (pendingChars.length >= 15) {
                  flushPending();
                } else if (!updateTimer) {
                  updateTimer = setTimeout(flushPending, 100);
                }
              }

              if (data.type === "assessment_ready_signal" && data.topic) {
                setAssessmentReadyTopic(data.topic);
              }

              if (data.type === "assessment_ready" && data.assessmentId) {
                setCurrentAssessmentId(data.assessmentId);
                setAssessmentModalOpen(true);
                setGeneratingAssessment(false);
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

      {assessmentReadyTopic && (
        <Box
          p={4}
          borderTop="1px solid"
          borderColor={colorMode === "dark" ? "gray.700" : "gray.200"}
          bg={colorMode === "dark" ? "gray.800" : "blue.50"}
          textAlign="center"
        >
          <Text mb={2} fontWeight="medium">
            Ready for assessment on: {assessmentReadyTopic}
          </Text>
          <Button
            colorScheme="blue"
            onClick={handleStartAssessment}
            isLoading={generatingAssessment}
            size="sm"
          >
            Start Assessment
          </Button>
        </Box>
      )}

      {inProgressAssessmentId && !assessmentModalOpen && (
        <Box
          p={4}
          borderTop="1px solid"
          borderColor={colorMode === "dark" ? "gray.700" : "gray.200"}
          bg={colorMode === "dark" ? "gray.800" : "yellow.50"}
          textAlign="center"
        >
          <Text mb={2} fontWeight="medium">
            {inProgressAssessmentTopic
              ? `Please complete assessment: ${inProgressAssessmentTopic}`
              : "Please complete assessment"}
          </Text>
          <Button
            colorScheme="blue"
            onClick={() => {
              setCurrentAssessmentId(inProgressAssessmentId);
              setAssessmentModalOpen(true);
            }}
            size="sm"
          >
            Resume Assessment
          </Button>
        </Box>
      )}

      {completedAssessmentId && !resultModalOpen && !inProgressAssessmentId && (
        <Box
          p={4}
          borderTop="1px solid"
          borderColor={colorMode === "dark" ? "gray.700" : "gray.200"}
          bg={colorMode === "dark" ? "gray.800" : "green.50"}
          textAlign="center"
        >
          <Text mb={2} fontWeight="medium">
            Assessment completed. Please review your results.
          </Text>
          <Button
            colorScheme="green"
            onClick={async () => {
              try {
                if (
                  resultAssessmentId === completedAssessmentId &&
                  assessmentResults
                ) {
                  setResultModalOpen(true);
                } else {
                  const response = await apiFetch(
                    `/api/assessments/${completedAssessmentId}`
                  );
                  if (!response.ok) {
                    throw new Error("Failed to fetch assessment");
                  }
                  const data = await response.json();

                  const assessment = data.assessment;
                  const items = data.items || [];
                  const correctCount = items.filter(
                    (item: any) => item.is_correct
                  ).length;
                  const totalItems = items.length;
                  const score = assessment.overall_score || 0;
                  const allPassed = score >= 80;
                  const failedConcepts =
                    assessment.metadata?.failed_concepts || [];

                  const results = {
                    score,
                    correctCount,
                    totalItems,
                    allPassed,
                    failedConcepts,
                  };

                  setResultAssessmentId(completedAssessmentId);
                  setAssessmentResults(results);
                  setResultModalOpen(true);
                }
              } catch (error) {
                console.error("Error reopening assessment results:", error);
              }
            }}
            size="sm"
          >
            View Results
          </Button>
        </Box>
      )}

      <ChatInput
        input={input}
        setInput={setInput}
        loading={loading}
        enableWebSearch={enableWebSearch}
        setEnableWebSearch={setEnableWebSearch}
        onSubmit={handleSubmit}
      />

      {currentAssessmentId && activeCourseId && user?.id && (
        <AssessmentModal
          isOpen={assessmentModalOpen}
          onClose={() => {
            setAssessmentModalOpen(false);
          }}
          assessmentId={currentAssessmentId}
          courseId={activeCourseId}
          userId={user.id}
          onComplete={async (assessmentId, allPassed) => {
            // Clear assessment state
            setInProgressAssessmentId(null);
            setInProgressAssessmentTopic(null);
            setCurrentAssessmentId(null);

            setCourses((prev) =>
              prev.map((course) => {
                if (course.id === activeCourseId) {
                  const metadata = (course as any).metadata || {};
                  const {
                    in_progress_assessment_id,
                    in_progress_assessment_topic,
                    ...cleanedMetadata
                  } = metadata;
                  return {
                    ...course,
                    metadata: cleanedMetadata,
                  };
                }
                return course;
              })
            );

            setAssessmentModalOpen(false);
          }}
          onResultsReady={(assessmentId, results) => {
            setCompletedAssessmentId(assessmentId);
            setResultAssessmentId(assessmentId);
            setAssessmentResults(results);
            setAssessmentModalOpen(false);
            setCurrentAssessmentId(null);
            setInProgressAssessmentId(null);
            setInProgressAssessmentTopic(null);
            requestAnimationFrame(() => {
              setResultModalOpen(true);
            });
          }}
        />
      )}

      {resultAssessmentId &&
        activeCourseId &&
        user?.id &&
        assessmentResults && (
          <AssessmentResultModal
            isOpen={resultModalOpen}
            onClose={() => {
              setResultModalOpen(false);
            }}
            assessmentId={resultAssessmentId}
            courseId={activeCourseId}
            userId={user.id}
            results={assessmentResults}
            onReadyForRevision={async () => {
              setInProgressAssessmentId(null);
              setInProgressAssessmentTopic(null);
              setCurrentAssessmentId(null);
              setCompletedAssessmentId(null);

              if (activeCourseId) {
                try {
                  const { data: courseData } = await supabase
                    .from("courses")
                    .select("metadata")
                    .eq("id", activeCourseId)
                    .single();

                  if (courseData?.metadata) {
                    const currentMetadata = courseData.metadata || {};
                    const {
                      in_progress_assessment_id,
                      in_progress_assessment_topic,
                      completed_assessment_id,
                      ...cleanedMetadata
                    } = currentMetadata;

                    await supabase
                      .from("courses")
                      .update({ metadata: cleanedMetadata })
                      .eq("id", activeCourseId);
                  }
                } catch (error) {
                  console.error(
                    "Error clearing completed assessment ID:",
                    error
                  );
                }
              }

              setCourses((prev) =>
                prev.map((course) => {
                  if (course.id === activeCourseId) {
                    const metadata = (course as any).metadata || {};
                    const {
                      in_progress_assessment_id,
                      in_progress_assessment_topic,
                      completed_assessment_id,
                      ...cleanedMetadata
                    } = metadata;
                    return {
                      ...course,
                      metadata: cleanedMetadata,
                    };
                  }
                  return course;
                })
              );

              setResultModalOpen(false);
              setResultAssessmentId(null);
              setAssessmentResults(null);

              try {
                await handleSubmit(
                  new Event("submit") as any,
                  `__READY_FOR_REVISION__:${resultAssessmentId}`
                );
              } catch (error) {
                console.error("Error triggering revision:", error);
              }
            }}
          />
        )}
    </Flex>
  );
}
