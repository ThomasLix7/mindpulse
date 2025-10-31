"use client";

import { Box, Flex, Heading, Text } from "@chakra-ui/react";
import { useState, useEffect } from "react";
import { getCurrentUser, supabase } from "@/utils/supabase-client";
import { apiFetch } from "@/utils/api-fetch";
import CourseSidebar from "@/components/ConversationSidebar";
import { useRouter, usePathname } from "next/navigation";
import { useColorMode } from "@/components/ui/color-mode";

interface Course {
  id: string;
  title: string;
  history?: Array<{ user: string; ai: string }>;
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
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load user and courses
  useEffect(() => {
    async function loadUserAndCourses() {
      const { user } = await getCurrentUser();
      setUser(user);

      if (user?.id) {
        try {
          // include auth token for RLS
          const {
            data: { session },
          } = await supabase.auth.getSession();

          const response = await apiFetch(`/api/courses?userId=${user.id}`, {
            method: "GET",
          });

          if (response.ok) {
            const data = await response.json();
            if (data.success && data.courses) {
              setCourses(data.courses);
            }
          }
        } catch (error) {
          console.error("Error loading courses:", error);
        }
      } else {
        // For non-logged in users, load from localStorage
        const storedCourses = localStorage.getItem("mindpulse-courses");
        if (storedCourses) {
          try {
            setCourses(JSON.parse(storedCourses));
          } catch (e) {
            console.error("Error parsing stored courses:", e);
          }
        }
      }

      setIsLoading(false);
    }

    loadUserAndCourses();

    // Listen for course creation events
    const handleNewCourse = (event: any) => {
      setCourses((prev) => {
        // Check if course already exists to avoid duplicates
        if (prev.some((course: any) => course.id === event.detail.id)) {
          return prev;
        }
        return [event.detail, ...prev];
      });
    };

    // Add event listener for course created
    window.addEventListener("course-created", handleNewCourse);

    // Cleanup
    return () => {
      window.removeEventListener("course-created", handleNewCourse);
    };
  }, []);

  // Handle course deletion
  const deleteCourse = async (id: string) => {
    // Get current course ID from URL
    const currentCourseId = pathname.split("/").pop();
    const isCurrentCourse = id === currentCourseId;

    // Store courses before updating state
    const currentCourses = [...courses];

    // Remove course from state immediately for responsive UI
    setCourses((prev) => prev.filter((course) => course.id !== id));

    // For logged-in users, delete on the server
    if (user?.id) {
      try {
        // include auth token for RLS
        await apiFetch(`/api/courses?id=${id}&userId=${user.id}`, {
          method: "DELETE",
        });
      } catch (error) {
        console.error("Error deleting course on server:", error);
      }
    } else {
      // For anonymous users, update localStorage
      const storedCourses = localStorage.getItem("mindpulse-courses");
      if (storedCourses) {
        try {
          const parsedCourses = JSON.parse(storedCourses);
          const updatedCourses = parsedCourses.filter(
            (course: any) => course.id !== id
          );
          localStorage.setItem(
            "mindpulse-courses",
            JSON.stringify(updatedCourses)
          );
        } catch (e) {
          console.error("Error updating stored courses:", e);
        }
      }
    }

    // If we deleted the current course, redirect to a different page
    if (isCurrentCourse) {
      const remainingCourses = currentCourses.filter(
        (course) => course.id !== id
      );

      if (remainingCourses.length > 0) {
        const nextCourse = remainingCourses[0];
        router.push(`/chat/${nextCourse.id}`);
      } else {
        router.push("/chat");
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
        courses={courses}
        isLoading={isLoading}
        userId={user?.id}
        onDeleteCourse={deleteCourse}
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
