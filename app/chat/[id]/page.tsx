"use client";

import { Box } from "@chakra-ui/react";
import Mentor from "@/components/Mentor";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getCurrentUser } from "@/utils/supabase-client";

export default function ChatPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = params.id as string;
  const [isLoading, setIsLoading] = useState(true);

  // Check authentication and set loading state
  useEffect(() => {
    const checkAuth = async () => {
      const { user } = await getCurrentUser();

      // Redirect to login if not authenticated
      if (!user?.id) {
        router.push("/login");
        return;
      }

      if (courseId) {
        console.log(
          `ChatPage: Loading course with ID: ${courseId}`
        );
        setIsLoading(false);
      }
    };

    checkAuth();
  }, [courseId, router]);

  if (isLoading) {
    return <Box padding={8}>Loading course...</Box>;
  }

  // The key prop forces the Chat component to re-mount when the course ID changes
  // This prevents any state confusion when navigating between different courses
  return (
    <Box padding={4}>
      <Box borderRadius="lg" boxShadow="md">
        <Mentor key={courseId} courseId={courseId} />
      </Box>
    </Box>
  );
}
