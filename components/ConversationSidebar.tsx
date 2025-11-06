"use client";

import {
  Box,
  Button,
  Text,
  Stack,
  Spinner,
  VStack,
  IconButton,
} from "@chakra-ui/react";
import { useRouter, usePathname } from "next/navigation";
import { useColorMode } from "@/components/ui/color-mode";
import { supabase } from "@/utils/supabase-client";
import { apiFetch } from "@/utils/api-fetch";
import { useState, useEffect } from "react";
import LearningPathForm, {
  LearningPathFormData,
} from "@/components/LearningPathForm";
import SkillConfirmationDialog from "@/components/SkillConfirmationDialog";
import {
  DialogRoot,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip } from "@/components/ui/tooltip";

interface CourseSidebarProps {
  learningPaths: any[];
  courses?: any[];
  isLoading: boolean;
  userId?: string;
  onDeleteLearningPath?: (id: string) => Promise<void>;
}

interface Course {
  id: string;
  title: string;
  learning_path_id: string;
  course_order: number;
  curriculum?: {
    lessons: Array<{
      title: string;
      description?: string;
      topics?: string[];
    }>;
  };
  current_lesson_index?: number;
  current_topic_index?: number;
}

export default function CourseSidebar({
  learningPaths,
  courses: coursesFromProps,
  isLoading,
  userId,
  onDeleteLearningPath,
}: CourseSidebarProps) {
  const { colorMode } = useColorMode();
  const router = useRouter();
  const pathname = usePathname();
  const currentPathId = pathname?.split("/").pop();
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(
    new Set()
  );
  const [expandedLessons, setExpandedLessons] = useState<Set<string>>(
    new Set()
  );
  const [coursesByPath, setCoursesByPath] = useState<Record<string, Course[]>>(
    {}
  );
  const [loadingCourses, setLoadingCourses] = useState<Set<string>>(new Set());
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [confirmCourse, setConfirmCourse] = useState<Course | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [pathToDelete, setPathToDelete] = useState<{
    id: string;
    title: string;
  } | null>(null);

  const togglePath = (pathId: string) => {
    setExpandedPaths((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(pathId)) {
        newSet.delete(pathId);
      } else {
        newSet.add(pathId);
        if (!coursesByPath[pathId]) {
          loadCoursesForPath(pathId);
        }
      }
      return newSet;
    });
  };

  const loadCoursesForPath = (pathId: string) => {
    if (coursesFromProps && coursesFromProps.length > 0) {
      const pathCourses = coursesFromProps
        .filter((c: Course) => c.learning_path_id === pathId)
        .sort((a: Course, b: Course) => a.course_order - b.course_order);
      setCoursesByPath((prev) => ({
        ...prev,
        [pathId]: pathCourses,
      }));
      return;
    }

    if (!userId || loadingCourses.has(pathId)) return;

    setLoadingCourses((prev) => new Set(prev).add(pathId));

    apiFetch(`/api/courses?userId=${userId}`)
      .then((response) => {
        if (response.ok) {
          return response.json();
        }
        return null;
      })
      .then((data) => {
        if (data?.success && data.courses) {
          const pathCourses = data.courses
            .filter((c: Course) => c.learning_path_id === pathId)
            .sort((a: Course, b: Course) => a.course_order - b.course_order);
          setCoursesByPath((prev) => ({
            ...prev,
            [pathId]: pathCourses,
          }));
        }
      })
      .catch((error) => {
        console.error("Error loading courses:", error);
      })
      .finally(() => {
        setLoadingCourses((prev) => {
          const newSet = new Set(prev);
          newSet.delete(pathId);
          return newSet;
        });
      });
  };

  useEffect(() => {
    if (currentPathId && learningPaths.some((p) => p.id === currentPathId)) {
      setExpandedPaths((prev) => new Set(prev).add(currentPathId));
      if (!coursesByPath[currentPathId] && userId) {
        loadCoursesForPath(currentPathId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPathId, learningPaths]);

  const navigateToLearningPath = (id: string) => {
    if (id === currentPathId) {
      return;
    }
    router.push(`/mentor/${id}`);
  };

  const handleCourseClick = (course: Course, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!userId) return;

    router.push(`/mentor/${course.id}`);
  };

  const confirmStartCourse = () => {
    if (!confirmCourse) return;

    router.push(`/mentor/${confirmCourse.id}`);
    setConfirmCourse(null);
  };

  const toggleCourse = (courseId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedCourses((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(courseId)) {
        newSet.delete(courseId);
      } else {
        newSet.add(courseId);
      }
      return newSet;
    });
  };

  const toggleLesson = (
    courseId: string,
    lessonIdx: number,
    e?: React.MouseEvent
  ) => {
    if (e) e.stopPropagation();
    const lessonKey = `${courseId}-${lessonIdx}`;
    setExpandedLessons((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(lessonKey)) {
        newSet.delete(lessonKey);
      } else {
        newSet.add(lessonKey);
      }
      return newSet;
    });
  };

  const [showSkillConfirmation, setShowSkillConfirmation] = useState(false);
  const [skillAssessment, setSkillAssessment] = useState<{
    learningPath: any;
    requiredSkills: any[];
  } | null>(null);

  const handleCreateLearningPath = async (formData: LearningPathFormData) => {
    if (!userId) return;

    try {
      const response = await apiFetch("/api/learning-paths", {
        method: "POST",
        body: JSON.stringify({
          userId: userId,
          ...formData,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.learningPath) {
          if (data.phase === "skill_assessment" && data.requiredSkills) {
            setSkillAssessment({
              learningPath: data.learningPath,
              requiredSkills: data.requiredSkills,
            });
            setShowSkillConfirmation(true);
            setIsFormOpen(false);
          } else {
            window.dispatchEvent(
              new CustomEvent("learning-path-created", {
                detail: data.learningPath,
              })
            );
            setIsFormOpen(false);
            router.push(`/mentor/${data.learningPath.id}`);
          }
        }
      } else {
        console.error("Failed to create learning path");
      }
    } catch (error) {
      console.error("Error creating learning path:", error);
    }
  };

  const handleConfirmSkills = async (
    confirmedSkills: Array<{
      skill_name: string;
      proficiency_level: string;
      id?: string | null;
    }>
  ) => {
    if (!userId || !skillAssessment) {
      return;
    }

    setShowSkillConfirmation(false);

    try {
      const response = await apiFetch("/api/learning-paths", {
        method: "POST",
        body: JSON.stringify({
          userId: userId,
          title: skillAssessment.learningPath.title,
          goal: skillAssessment.learningPath.goal,
          domain: skillAssessment.learningPath.domain,
          subject: skillAssessment.learningPath.subject,
          level: skillAssessment.learningPath.level,
          learningPathId: skillAssessment.learningPath.id,
          confirmedSkills,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.learningPath) {
          window.dispatchEvent(
            new CustomEvent("learning-path-created", {
              detail: data.learningPath,
            })
          );
          router.push(`/mentor/${data.learningPath.id}`);
        }
      } else {
        console.error("Failed to generate curriculum");
      }
    } catch (error) {
      console.error("Error generating curriculum:", error);
    } finally {
      setSkillAssessment(null);
    }
  };

  const createNewLearningPath = () => {
    setIsFormOpen(true);
  };

  const handleDelete = (e: React.MouseEvent, id: string, title: string) => {
    e.stopPropagation();
    setPathToDelete({ id, title: title || "this learning path" });
  };

  const confirmDelete = () => {
    if (pathToDelete && onDeleteLearningPath) {
      onDeleteLearningPath(pathToDelete.id);
      setPathToDelete(null);
    }
  };

  return (
    <Box
      w={isCollapsed ? "50px" : "320px"}
      borderRight="1px solid"
      borderColor={colorMode === "dark" ? "gray.700" : "gray.200"}
      p={3}
      display={{ base: "none", md: "block" }}
      bg={colorMode === "dark" ? "gray.900" : "gray.50"}
      h="100%"
      overflow="hidden"
      position="relative"
      transition="width 0.2s ease"
    >
      <Stack h="100%" gap={3} display="flex" flexDirection="column">
        {/* Sidebar Header with Collapse Button */}
        <Box display="flex" justifyContent="space-between" alignItems="center">
          {!isCollapsed && (
            <Text
              fontSize="sm"
              fontWeight="bold"
              color={colorMode === "dark" ? "gray.400" : "gray.600"}
            >
              LEARNING PATHS
            </Text>
          )}
          <IconButton
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            size="xs"
            variant="ghost"
            onClick={() => setIsCollapsed(!isCollapsed)}
            colorScheme="gray"
          >
            <Text fontSize="sm">{isCollapsed ? "▶" : "◀"}</Text>
          </IconButton>
        </Box>

        {/* Learning Paths List */}
        {!isCollapsed && (
          <>
            {isLoading ? (
              <Box textAlign="center" py={8}>
                <Spinner size="sm" color="blue.400" />
                <Text
                  mt={2}
                  fontSize="sm"
                  color={colorMode === "dark" ? "gray.400" : "gray.600"}
                >
                  Loading learning paths...
                </Text>
              </Box>
            ) : learningPaths.length === 0 ? (
              <Box textAlign="center" py={8}>
                <Text
                  fontSize="sm"
                  color={colorMode === "dark" ? "gray.400" : "gray.600"}
                >
                  No learning paths yet
                </Text>
              </Box>
            ) : (
              <Box overflowY="auto" flex="1">
                <Stack gap={1}>
                  {learningPaths.map((path: any) => {
                    const isExpanded = expandedPaths.has(path.id);
                    const courses = coursesByPath[path.id] || [];
                    const isLoadingPathCourses = loadingCourses.has(path.id);

                    return (
                      <Box key={path.id}>
                        <Box
                          pt={2}
                          pr={2}
                          pb={2}
                          pl={0}
                          cursor="pointer"
                          borderRadius="md"
                          bg={
                            path.id === currentPathId
                              ? colorMode === "dark"
                                ? "gray.800"
                                : "blue.50"
                              : "transparent"
                          }
                          _hover={{
                            bg:
                              path.id !== currentPathId
                                ? colorMode === "dark"
                                  ? "gray.800"
                                  : "gray.200"
                                : colorMode === "dark"
                                ? "gray.700"
                                : "blue.100",
                          }}
                          onClick={() => togglePath(path.id)}
                        >
                          <Box
                            display="flex"
                            justifyContent="space-between"
                            alignItems="center"
                          >
                            <Box
                              flex="1"
                              overflow="hidden"
                              display="flex"
                              alignItems="center"
                              gap={1}
                            >
                              <Text
                                as="span"
                                fontSize="xs"
                                color={
                                  colorMode === "dark" ? "gray.500" : "gray.400"
                                }
                              >
                                {isExpanded ? "▼" : "▶"}
                              </Text>
                              <Box flex="1" minW={0}>
                                <Tooltip
                                  content={path.title || "New Learning Path"}
                                  disabled={
                                    !path.title || path.title.length < 30
                                  }
                                >
                                  <Text
                                    fontSize="sm"
                                    fontWeight={
                                      path.id === currentPathId
                                        ? "bold"
                                        : "normal"
                                    }
                                    color={
                                      path.id === currentPathId
                                        ? colorMode === "dark"
                                          ? "blue.300"
                                          : "blue.600"
                                        : colorMode === "dark"
                                        ? "gray.300"
                                        : "gray.700"
                                    }
                                    wordBreak="break-word"
                                    lineHeight="1.4"
                                  >
                                    {path.title || "New Learning Path"}
                                  </Text>
                                </Tooltip>
                                {path.goal && (
                                  <Tooltip
                                    content={path.goal}
                                    disabled={
                                      !path.goal || path.goal.length < 40
                                    }
                                  >
                                    <Text
                                      fontSize="xs"
                                      color={
                                        colorMode === "dark"
                                          ? "gray.500"
                                          : "gray.600"
                                      }
                                      wordBreak="break-word"
                                      lineHeight="1.3"
                                      mt={0.5}
                                    >
                                      {path.goal}
                                    </Text>
                                  </Tooltip>
                                )}
                              </Box>
                            </Box>
                            <Box
                              as="span"
                              fontSize="sm"
                              ml={2}
                              color={
                                colorMode === "dark" ? "gray.500" : "gray.600"
                              }
                              _hover={{ color: "red.400" }}
                              cursor="pointer"
                              onClick={(e) =>
                                handleDelete(e, path.id, path.title)
                              }
                            >
                              ×
                            </Box>
                          </Box>
                        </Box>
                        {isExpanded && (
                          <Box pl={2} mt={1}>
                            {isLoadingPathCourses ? (
                              <Box py={2}>
                                <Spinner size="xs" color="blue.400" />
                              </Box>
                            ) : courses.length === 0 ? (
                              <Text
                                fontSize="xs"
                                color={
                                  colorMode === "dark" ? "gray.500" : "gray.600"
                                }
                                py={2}
                              >
                                No courses yet
                              </Text>
                            ) : (
                              <Stack gap={0.5}>
                                {courses.map((course: Course) => {
                                  const isCourseExpanded = expandedCourses.has(
                                    course.id
                                  );
                                  const lessons =
                                    course.curriculum?.lessons || [];
                                  const isCurrentCourse = pathname?.includes(
                                    `/course/${course.id}`
                                  );
                                  const currentLessonIdx =
                                    course.current_lesson_index ?? -1;
                                  const currentTopicIdx =
                                    course.current_topic_index ?? -1;

                                  return (
                                    <Box key={course.id}>
                                      <Box
                                        p={1.5}
                                        pl={1}
                                        borderRadius="sm"
                                        bg={
                                          isCurrentCourse
                                            ? colorMode === "dark"
                                              ? "gray.750"
                                              : "blue.50"
                                            : "transparent"
                                        }
                                      >
                                        <Box
                                          display="flex"
                                          alignItems="center"
                                          gap={1}
                                        >
                                          <Text
                                            as="span"
                                            fontSize="sm"
                                            color={
                                              colorMode === "dark"
                                                ? "gray.500"
                                                : "gray.400"
                                            }
                                            cursor="pointer"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              toggleCourse(course.id, e);
                                            }}
                                          >
                                            {lessons.length > 0
                                              ? isCourseExpanded
                                                ? "▼"
                                                : "▶"
                                              : ""}
                                          </Text>
                                          <Tooltip
                                            content={course.title}
                                            disabled={
                                              !course.title ||
                                              course.title.length < 25
                                            }
                                          >
                                            <Text
                                              fontSize="sm"
                                              color={
                                                isCurrentCourse
                                                  ? colorMode === "dark"
                                                    ? "blue.300"
                                                    : "blue.600"
                                                  : colorMode === "dark"
                                                  ? "gray.300"
                                                  : "gray.700"
                                              }
                                              fontWeight={
                                                isCurrentCourse
                                                  ? "bold"
                                                  : "normal"
                                              }
                                              flex="1"
                                              minW={0}
                                              cursor="pointer"
                                              _hover={{ color: "blue.400" }}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleCourseClick(course, e);
                                              }}
                                              wordBreak="break-word"
                                              lineHeight="1.4"
                                            >
                                              {course.title}
                                              {currentLessonIdx >= 0 && (
                                                <Text
                                                  as="span"
                                                  fontSize="xs"
                                                  color={
                                                    colorMode === "dark"
                                                      ? "blue.400"
                                                      : "blue.600"
                                                  }
                                                  ml={1}
                                                  whiteSpace="nowrap"
                                                >
                                                  (Current)
                                                </Text>
                                              )}
                                            </Text>
                                          </Tooltip>
                                        </Box>
                                      </Box>
                                      {isCourseExpanded &&
                                        lessons.length > 0 && (
                                          <Box pl={4} mt={0.5}>
                                            <Stack gap={0.5}>
                                              {lessons.map(
                                                (lesson, lessonIdx) => {
                                                  const isCurrentLesson =
                                                    lessonIdx ===
                                                    currentLessonIdx;
                                                  const topics =
                                                    lesson.topics || [];
                                                  const hasTopics =
                                                    topics.length > 0;
                                                  const lessonKey = `${course.id}-${lessonIdx}`;
                                                  const isLessonExpanded =
                                                    expandedLessons.has(
                                                      lessonKey
                                                    );

                                                  return (
                                                    <Box key={lessonIdx}>
                                                      <Box
                                                        p={1}
                                                        pl={1}
                                                        borderRadius="xs"
                                                        bg={
                                                          isCurrentLesson
                                                            ? colorMode ===
                                                              "dark"
                                                              ? "gray.750"
                                                              : "blue.50"
                                                            : "transparent"
                                                        }
                                                      >
                                                        <Box
                                                          display="flex"
                                                          alignItems="center"
                                                          gap={1}
                                                        >
                                                          <Text
                                                            as="span"
                                                            fontSize="xs"
                                                            color={
                                                              colorMode ===
                                                              "dark"
                                                                ? "gray.500"
                                                                : "gray.400"
                                                            }
                                                            cursor={
                                                              hasTopics
                                                                ? "pointer"
                                                                : "default"
                                                            }
                                                            onClick={(e) => {
                                                              if (hasTopics) {
                                                                toggleLesson(
                                                                  course.id,
                                                                  lessonIdx,
                                                                  e
                                                                );
                                                              }
                                                            }}
                                                          >
                                                            {hasTopics
                                                              ? isLessonExpanded
                                                                ? "▼"
                                                                : "▶"
                                                              : ""}
                                                          </Text>
                                                          <Tooltip
                                                            content={
                                                              lesson.title
                                                            }
                                                            disabled={
                                                              !lesson.title ||
                                                              lesson.title
                                                                .length < 30
                                                            }
                                                          >
                                                            <Text
                                                              fontSize="xs"
                                                              color={
                                                                isCurrentLesson
                                                                  ? colorMode ===
                                                                    "dark"
                                                                    ? "blue.200"
                                                                    : "blue.600"
                                                                  : colorMode ===
                                                                    "dark"
                                                                  ? "gray.400"
                                                                  : "gray.600"
                                                              }
                                                              fontWeight={
                                                                isCurrentLesson
                                                                  ? "bold"
                                                                  : "normal"
                                                              }
                                                              flex="1"
                                                              minW={0}
                                                              wordBreak="break-word"
                                                              lineHeight="1.3"
                                                            >
                                                              {lesson.title}
                                                              {isCurrentLesson &&
                                                                currentTopicIdx >=
                                                                  0 && (
                                                                  <Text
                                                                    as="span"
                                                                    fontSize="xs"
                                                                    color={
                                                                      colorMode ===
                                                                      "dark"
                                                                        ? "blue.300"
                                                                        : "blue.600"
                                                                    }
                                                                    ml={1}
                                                                    whiteSpace="nowrap"
                                                                  >
                                                                    (Topic{" "}
                                                                    {currentTopicIdx +
                                                                      1}
                                                                    )
                                                                  </Text>
                                                                )}
                                                            </Text>
                                                          </Tooltip>
                                                        </Box>
                                                      </Box>
                                                      {hasTopics &&
                                                        isLessonExpanded && (
                                                          <Box pl={2} mt={0.5}>
                                                            <Stack gap={0.25}>
                                                              {topics.map(
                                                                (
                                                                  topic,
                                                                  topicIdx
                                                                ) => {
                                                                  const isCurrentTopic =
                                                                    isCurrentLesson &&
                                                                    topicIdx ===
                                                                      currentTopicIdx;
                                                                  return (
                                                                    <Box
                                                                      key={
                                                                        topicIdx
                                                                      }
                                                                      p={0.5}
                                                                      pl={1}
                                                                      borderRadius="xs"
                                                                      bg={
                                                                        isCurrentTopic
                                                                          ? "blue.900"
                                                                          : "transparent"
                                                                      }
                                                                    >
                                                                      <Tooltip
                                                                        content={
                                                                          topic
                                                                        }
                                                                        disabled={
                                                                          !topic ||
                                                                          topic.length <
                                                                            25
                                                                        }
                                                                      >
                                                                        <Text
                                                                          fontSize="xs"
                                                                          color={
                                                                            isCurrentTopic
                                                                              ? colorMode ===
                                                                                "dark"
                                                                                ? "blue.200"
                                                                                : "blue.600"
                                                                              : colorMode ===
                                                                                "dark"
                                                                              ? "gray.500"
                                                                              : "gray.600"
                                                                          }
                                                                          fontWeight={
                                                                            isCurrentTopic
                                                                              ? "bold"
                                                                              : "normal"
                                                                          }
                                                                          wordBreak="break-word"
                                                                          lineHeight="1.3"
                                                                        >
                                                                          {isCurrentTopic
                                                                            ? "→ "
                                                                            : "  "}
                                                                          {
                                                                            topic
                                                                          }
                                                                        </Text>
                                                                      </Tooltip>
                                                                    </Box>
                                                                  );
                                                                }
                                                              )}
                                                            </Stack>
                                                          </Box>
                                                        )}
                                                    </Box>
                                                  );
                                                }
                                              )}
                                            </Stack>
                                          </Box>
                                        )}
                                    </Box>
                                  );
                                })}
                              </Stack>
                            )}
                          </Box>
                        )}
                      </Box>
                    );
                  })}
                </Stack>
              </Box>
            )}
          </>
        )}

        {/* New Learning Path Button */}
        {!isCollapsed && (
          <Button
            colorScheme="blue"
            size="sm"
            leftIcon={<Box as="span">+</Box>}
            onClick={createNewLearningPath}
            mt="auto"
            bg="blue.600"
            _hover={{ bg: "blue.500" }}
          >
            New Path
          </Button>
        )}
        {isCollapsed && (
          <IconButton
            aria-label="New Learning Path"
            size="sm"
            onClick={createNewLearningPath}
            mt="auto"
            colorScheme="blue"
            bg="blue.600"
            _hover={{ bg: "blue.500" }}
          >
            <Text>+</Text>
          </IconButton>
        )}
      </Stack>

      <LearningPathForm
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSubmit={handleCreateLearningPath}
      />

      {skillAssessment && (
        <SkillConfirmationDialog
          isOpen={showSkillConfirmation}
          onClose={() => {
            setShowSkillConfirmation(false);
            setSkillAssessment(null);
          }}
          requiredSkills={skillAssessment.requiredSkills}
          onConfirm={handleConfirmSkills}
        />
      )}

      <DialogRoot
        open={!!confirmCourse}
        onOpenChange={(details) => !details.open && setConfirmCourse(null)}
      >
        <DialogContent maxW="500px">
          <DialogHeader>
            <DialogTitle>Start This Course?</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {confirmCourse && (
              <VStack gap={4} align="stretch">
                <Text>
                  Are you ready to start <strong>{confirmCourse.title}</strong>?
                </Text>
                {confirmCourse.current_lesson_index !== undefined &&
                confirmCourse.current_lesson_index >= 0 ? (
                  <Box
                    p={3}
                    bg={colorMode === "dark" ? "gray.800" : "gray.100"}
                    borderRadius="md"
                  >
                    <Text
                      fontSize="sm"
                      color={colorMode === "dark" ? "gray.300" : "gray.700"}
                    >
                      <strong>Current Position:</strong>
                    </Text>
                    {confirmCourse.curriculum?.lessons?.[
                      confirmCourse.current_lesson_index
                    ] && (
                      <Text
                        fontSize="sm"
                        color={colorMode === "dark" ? "gray.400" : "gray.600"}
                        mt={1}
                      >
                        Lesson:{" "}
                        {
                          confirmCourse.curriculum.lessons[
                            confirmCourse.current_lesson_index
                          ]?.title
                        }
                        {confirmCourse.current_topic_index !== undefined &&
                          confirmCourse.current_topic_index >= 0 &&
                          confirmCourse.curriculum.lessons[
                            confirmCourse.current_lesson_index
                          ]?.topics?.[confirmCourse.current_topic_index] && (
                            <>
                              <br />
                              Topic:{" "}
                              {
                                confirmCourse.curriculum.lessons[
                                  confirmCourse.current_lesson_index
                                ]?.topics?.[confirmCourse.current_topic_index]
                              }
                            </>
                          )}
                      </Text>
                    )}
                  </Box>
                ) : (
                  <Text
                    fontSize="sm"
                    color={colorMode === "dark" ? "gray.400" : "gray.600"}
                  >
                    This is a new course. Ready to begin?
                  </Text>
                )}
              </VStack>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmCourse(null)}>
              Cancel
            </Button>
            <Button colorScheme="blue" onClick={confirmStartCourse}>
              Yes, Start Learning
            </Button>
          </DialogFooter>
        </DialogContent>
      </DialogRoot>

      <DialogRoot
        open={!!pathToDelete}
        onOpenChange={(details) => !details.open && setPathToDelete(null)}
      >
        <DialogContent maxW="500px">
          <DialogHeader>
            <DialogTitle>Delete Learning Path?</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {pathToDelete && (
              <VStack gap={4} align="stretch">
                <Text>
                  Are you sure you want to delete{" "}
                  <strong>{pathToDelete.title}</strong>?
                </Text>
                <Text fontSize="sm" color="red.400">
                  This action cannot be undone. All courses, lessons, and
                  progress in this learning path will be permanently deleted.
                </Text>
              </VStack>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPathToDelete(null)}>
              Cancel
            </Button>
            <Button colorScheme="red" onClick={confirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </DialogRoot>
    </Box>
  );
}
