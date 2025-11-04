"use client";

import { Box } from "@chakra-ui/react";
import Mentor from "@/components/Mentor";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getCurrentUser } from "@/utils/supabase-client";
import { useLearningData } from "../LearningDataContext";

export default function ChatPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { courses, learningPaths, isLoading: dataLoading } = useLearningData();
  const [isLoading, setIsLoading] = useState(true);
  const [courseId, setCourseId] = useState<string | undefined>();
  const [learningPathId, setLearningPathId] = useState<string | undefined>();

  useEffect(() => {
    const checkAuthAndId = async () => {
      const { user } = await getCurrentUser();

      if (!user?.id) {
        router.push("/login");
        return;
      }

      if (!id) {
        setIsLoading(false);
        return;
      }

      if (dataLoading) {
        return;
      }

      // Check if it's a course
      const course = courses?.find((c: any) => c.id === id);
      if (course) {
        setCourseId(id);
        setIsLoading(false);
        return;
      }

      // Check if it's a learning path
      const learningPath = learningPaths?.find((lp: any) => lp.id === id);
      if (learningPath) {
        setLearningPathId(id);
        setIsLoading(false);
        return;
      }

      // Neither found, redirect to home
      router.push("/mentor");
    };

    checkAuthAndId();
  }, [id, router, courses, learningPaths, dataLoading]);

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
