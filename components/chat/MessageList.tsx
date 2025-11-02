import { Box, Text, Spinner } from "@chakra-ui/react";
import { useColorMode } from "@/components/ui/color-mode";
import { MessageItem } from "./MessageItem";
import { Course } from "@/types/chat";

interface MessageListProps {
  course: Course | null;
  historyLoading: boolean;
  user: any;
}

export function MessageList({
  course,
  historyLoading,
  user,
}: MessageListProps) {
  const { colorMode } = useColorMode();

  if (historyLoading) {
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

  if (
    !course ||
    !course.history ||
    course.history.length === 0
  ) {
    return null;
  }

  return (
    <Box>
      {course.history.map((message, index) => (
        <MessageItem
          key={index}
          message={message}
          index={index}
          courseId={course.id}
          user={user}
        />
      ))}
    </Box>
  );
}
