"use client";

import { Box } from "@chakra-ui/react";
import Mentor from "@/components/Mentor";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getCurrentUser } from "@/utils/supabase-client";
import { apiFetch } from "@/utils/api-fetch";

export default function ChatPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [isLoading, setIsLoading] = useState(true);
  const [courseId, setCourseId] = useState<string | undefined>();
  const [learningPathId, setLearningPathId] = useState<string | undefined>();

  // Check authentication and determine if ID is a course or learning path
  useEffect(() => {
    const checkAuthAndId = async () => {
      const { user } = await getCurrentUser();

      // Redirect to login if not authenticated
      if (!user?.id) {
        router.push("/login");
        return;
      }

      if (!id) {
        setIsLoading(false);
        return;
      }

      // Try to determine if it's a course or learning path
      try {
        // First, check if it's a course
        const courseResponse = await apiFetch(
          `/api/courses?userId=${user.id}&courseId=${id}`
        );

        if (courseResponse.ok) {
          const courseData = await courseResponse.json();
          if (courseData.success && courseData.course) {
            setCourseId(id);
            setIsLoading(false);
            return;
          }
        }

        // If not a course, check if it's a learning path
        const pathResponse = await apiFetch(
          `/api/learning-paths?userId=${user.id}&learningPathId=${id}`
        );

        if (pathResponse.ok) {
          const pathData = await pathResponse.json();
          if (pathData.success && pathData.learningPath) {
            setLearningPathId(id);
            setIsLoading(false);
            return;
          }
        }

        // Neither found, redirect to home
        router.push("/mentor");
      } catch (error) {
        console.error("Error checking ID:", error);
        router.push("/mentor");
      }
    };

    checkAuthAndId();
  }, [id, router]);

  if (isLoading) {
    return <Box padding={8}>Loading...</Box>;
  }

  return (
    <Box padding={4}>
      <Box borderRadius="lg" boxShadow="md">
        <Mentor
          key={courseId || learningPathId}
          courseId={courseId}
          learningPathId={learningPathId}
        />
      </Box>
    </Box>
  );
}
