import { useState } from "react";
import { Box, Input, Button, Heading, Flex, Badge, Text } from "@chakra-ui/react";
import { useColorMode } from "@/components/ui/color-mode";

interface ChatHeaderProps {
  title: string;
  learningPathTitle?: string;
  courseOrder?: number;
  onTitleUpdate: (newTitle: string) => Promise<void>;
  onClearChat: () => void;
  hasHistory: boolean;
}

export function ChatHeader({
  title,
  learningPathTitle,
  courseOrder,
  onTitleUpdate,
  onClearChat,
  hasHistory,
}: ChatHeaderProps) {
  const { colorMode } = useColorMode();
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [updatingTitle, setUpdatingTitle] = useState(false);

  const formatTitle = (courseTitle: string) => {
    return courseTitle.replace(/^Course \d+:\s*/i, "");
  };

  const displayTitle = formatTitle(title);

  const startTitleEdit = () => {
    setNewTitle(displayTitle);
    setIsEditingTitle(true);
  };

  const submitTitleUpdate = async () => {
    if (!newTitle.trim()) {
      return;
    }

    setUpdatingTitle(true);
    try {
      await onTitleUpdate(newTitle.trim());
      setIsEditingTitle(false);
    } catch (error) {
      console.error("Error updating title:", error);
      alert("Failed to update the course title. Please try again.");
    } finally {
      setUpdatingTitle(false);
    }
  };

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
      {/* Current Course Title with Edit Mode */}
      {isEditingTitle ? (
        <Flex alignItems="center" flex="1" mr={2}>
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            size="md"
            fontSize="md"
            fontWeight="medium"
            bg={colorMode === "dark" ? "gray.800" : "gray.100"}
            color={colorMode === "dark" ? "white" : "black"}
            border="1px solid"
            borderColor="blue.400"
            mr={2}
            placeholder="Enter new title"
            autoFocus
            onKeyPress={(e) => {
              if (e.key === "Enter") submitTitleUpdate();
            }}
          />
          <Button
            size="sm"
            colorScheme="blue"
            onClick={submitTitleUpdate}
            isLoading={updatingTitle}
            mr={1}
          >
            Save
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={cancelTitleEdit}
            disabled={updatingTitle}
          >
            Cancel
          </Button>
        </Flex>
      ) : (
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
          <Button
            size="sm"
            variant="ghost"
            ml={2}
            onClick={startTitleEdit}
            _hover={{ bg: colorMode === "dark" ? "gray.700" : "gray.200" }}
            title="Edit title"
          >
            ✐
          </Button>
        </Flex>
      )}

      {/* Clear Chat button */}
      <Box display="flex" alignItems="center" gap={2}>
        <Button
          variant="outline"
          size="sm"
          colorScheme="red"
          onClick={onClearChat}
          isDisabled={!hasHistory}
          borderColor="red.700"
          color="red.300"
          _hover={{ bg: "red.900" }}
        >
          Clear Chat
        </Button>
      </Box>
    </Box>
  );
}
