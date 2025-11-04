import { Box, Text, Spinner } from "@chakra-ui/react";
import { useColorMode } from "@/components/ui/color-mode";
import { MessageItem } from "./MessageItem";
import { Course } from "@/types/chat";
import { useState, useEffect, useRef } from "react";

interface MessageListProps {
  course: Course | null;
  historyLoading: boolean;
}

export function MessageList({ course, historyLoading }: MessageListProps) {
  const { colorMode } = useColorMode();
  const [displayedMessages, setDisplayedMessages] = useState<any[]>([]);
  const lastCourseIdRef = useRef<string | null>(null);
  const isInitializedRef = useRef(false);
  const lastHistoryRef = useRef<any[] | null>(null);

  useEffect(() => {
    const courseChanged = lastCourseIdRef.current !== course?.id;
    if (courseChanged) {
      lastCourseIdRef.current = course?.id || null;
      isInitializedRef.current = false;
      lastHistoryRef.current = null;
    }

    if (!course?.history) {
      if (courseChanged) {
        setDisplayedMessages([]);
        lastHistoryRef.current = null;
      }
      return;
    }

    const historyLength = course.history.length;
    const lastHistory = lastHistoryRef.current;
    const lastLength = lastHistory?.length || 0;

    const contentChanged =
      historyLength !== lastLength ||
      (lastLength > 0 &&
        historyLength > 0 &&
        lastHistory &&
        lastHistory[lastLength - 1]?.ai !==
          course.history[historyLength - 1]?.ai);

    if (!isInitializedRef.current || courseChanged || contentChanged) {
      setDisplayedMessages([...course.history]);
      isInitializedRef.current = true;
      lastHistoryRef.current = course.history;
    }
  }, [course?.id, course?.history]);

  if (historyLoading && displayedMessages.length === 0) {
    return (
      <Box textAlign="center" py={6}>
        <Spinner size="sm" color="blue.400" mb={2} />
        <Text
          fontSize="sm"
          color={colorMode === "dark" ? "gray.400" : "gray.600"}
        >
          Loading course...
        </Text>
      </Box>
    );
  }

  if (!course || !course.history || course.history.length === 0) {
    return null;
  }

  return (
    <Box>
      {displayedMessages.map((message, index) => (
        <MessageItem
          key={`${message.timestamp || index}-${index}`}
          message={message}
        />
      ))}
    </Box>
  );
}
