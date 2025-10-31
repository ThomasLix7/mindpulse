"use client";

import { Box, Button, Text, Stack, Spinner } from "@chakra-ui/react";
import { useRouter, usePathname } from "next/navigation";
import { useColorMode } from "@/components/ui/color-mode";
import { supabase } from "@/utils/supabase-client";
import { apiFetch } from "@/utils/api-fetch";

interface CourseSidebarProps {
  courses: any[];
  isLoading: boolean;
  userId?: string;
  onDeleteCourse?: (id: string) => Promise<void>;
}

export default function CourseSidebar({
  courses,
  isLoading,
  userId,
  onDeleteCourse,
}: CourseSidebarProps) {
  const { colorMode } = useColorMode();
  const router = useRouter();
  const pathname = usePathname();
  const currentCourseId = pathname?.split("/").pop();

  const navigateToCourse = (id: string) => {
    if (id === currentCourseId) {
      return;
    }

    router.push(`/chat/${id}`);
  };

  const createNewCourse = async () => {
    if (!userId) return;

    try {
      // Get user's access token
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;

      if (!accessToken) {
        console.error("No access token available");
        return;
      }

      const response = await apiFetch("/api/courses", {
        method: "POST",
        body: JSON.stringify({
          userId: userId,
          title: "New Course",
          learningPathId: "", // TODO: Get from context
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.course) {
          // Navigate directly to the new course
          router.push(`/chat/${data.course.id}`);
        }
      } else {
        console.error("Failed to create course");
      }
    } catch (error) {
      console.error("Error creating course:", error);
    }
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (onDeleteCourse) {
      onDeleteCourse(id);
    }
  };

  return (
    <Box
      w="250px"
      borderRight="1px solid"
      borderColor="gray.700"
      p={3}
      display={{ base: "none", md: "block" }}
      bg={colorMode === "dark" ? "gray.900" : "gray.50"}
      h="100%"
      overflow="hidden"
      position="relative"
    >
      <Stack h="100%" gap={3} display="flex" flexDirection="column">
        {/* Sidebar Header */}
        <Text
          fontSize="sm"
          fontWeight="bold"
          color={colorMode === "dark" ? "gray.400" : "gray.600"}
          mb={2}
        >
          COURSES
        </Text>

        {/* Courses List */}
        {isLoading ? (
          <Box textAlign="center" py={8}>
            <Spinner size="sm" color="blue.400" />
            <Text
              mt={2}
              fontSize="sm"
              color={colorMode === "dark" ? "gray.400" : "gray.600"}
            >
              Loading courses...
            </Text>
          </Box>
        ) : courses.length === 0 ? (
          <Box textAlign="center" py={8}>
            <Text
              fontSize="sm"
              color={colorMode === "dark" ? "gray.400" : "gray.600"}
            >
              No courses yet
            </Text>
          </Box>
        ) : (
          <Box overflowY="auto" flex="1">
            <Stack gap={1}>
              {courses.map((course: any) => (
                <Box
                  key={course.id}
                  p={2}
                  cursor="pointer"
                  borderRadius="md"
                  bg={
                    course.id === currentCourseId ? "gray.800" : "transparent"
                  }
                  _hover={{
                    bg: course.id !== currentCourseId ? "gray.800" : "gray.700",
                  }}
                  onClick={() => navigateToCourse(course.id)}
                >
                  <Box
                    display="flex"
                    justifyContent="space-between"
                    alignItems="center"
                  >
                    <Text
                      fontSize="sm"
                      fontWeight={
                        course.id === currentCourseId ? "bold" : "normal"
                      }
                      color={
                        course.id === currentCourseId ? "blue.300" : "gray.300"
                      }
                      overflow="hidden"
                      textOverflow="ellipsis"
                      whiteSpace="nowrap"
                      flex="1"
                    >
                      {course.title || "New Course"}
                    </Text>
                    <Box
                      as="span"
                      fontSize="sm"
                      ml={2}
                      color="gray.500"
                      _hover={{ color: "red.400" }}
                      cursor="pointer"
                      onClick={(e) => handleDelete(e, course.id)}
                    >
                      ×
                    </Box>
                  </Box>
                </Box>
              ))}
            </Stack>
          </Box>
        )}

        {/* New Course Button */}
        <Button
          colorScheme="blue"
          size="sm"
          leftIcon={<Box as="span">+</Box>}
          onClick={createNewCourse}
          mt="auto"
          bg="blue.600"
          _hover={{ bg: "blue.500" }}
        >
          New Course
        </Button>
      </Stack>
    </Box>
  );
}
