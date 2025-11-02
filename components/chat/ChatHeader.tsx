import { Box, Heading, Flex, Badge } from "@chakra-ui/react";
import { useColorMode } from "@/components/ui/color-mode";

interface ChatHeaderProps {
  title: string;
  learningPathTitle?: string;
  courseOrder?: number;
}

export function ChatHeader({
  title,
  learningPathTitle,
  courseOrder,
}: ChatHeaderProps) {
  const { colorMode } = useColorMode();

  const formatTitle = (courseTitle: string) => {
    return courseTitle.replace(/^Course \d+:\s*/i, "");
  };

  const displayTitle = formatTitle(title);

  return (
    <Box
      w="100%"
      p={3}
      display="flex"
      justifyContent="space-between"
      alignItems="center"
      position="sticky"
      height="50px"
      zIndex={2}
      flexShrink={0}
    >
      {/* Current Course Title */}
      <Flex alignItems="center" flex="1" gap={3}>
        {learningPathTitle ? (
          <Box>
            <Badge
              colorScheme="purple"
              fontSize="sm"
              px={3}
              py={1}
              borderRadius="md"
              fontWeight="semibold"
              textTransform="uppercase"
              mb={1}
              display="block"
            >
              {learningPathTitle}
            </Badge>
            <Badge
              colorScheme="blue"
              fontSize="sm"
              px={3}
              py={1}
              borderRadius="md"
              fontWeight="semibold"
            >
              {courseOrder !== undefined && `Course ${courseOrder + 1}: `}
              {displayTitle || "New Course"}
            </Badge>
          </Box>
        ) : (
          <Heading size="md" fontWeight="medium" color={colorMode === "dark" ? "white" : "black"}>
            {displayTitle || "New Course"}
          </Heading>
        )}
      </Flex>
    </Box>
  );
}
