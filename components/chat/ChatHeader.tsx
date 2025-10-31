import { useState } from "react";
import { Box, Input, Button, Heading, Flex } from "@chakra-ui/react";

interface ChatHeaderProps {
  title: string;
  onTitleUpdate: (newTitle: string) => Promise<void>;
  onClearChat: () => void;
  hasHistory: boolean;
}

export function ChatHeader({
  title,
  onTitleUpdate,
  onClearChat,
  hasHistory,
}: ChatHeaderProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [updatingTitle, setUpdatingTitle] = useState(false);

  // Start title edit mode
  const startTitleEdit = () => {
    setNewTitle(title);
    setIsEditingTitle(true);
  };

  // Cancel title edit
  const cancelTitleEdit = () => {
    setIsEditingTitle(false);
    setNewTitle("");
  };

  // Submit title update
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
            bg="gray.800"
            color="white"
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
        <Flex alignItems="center">
          <Heading size="md" fontWeight="medium" color="white">
            {title || "New Course"}
          </Heading>
          <Button
            size="sm"
            variant="ghost"
            ml={2}
            onClick={startTitleEdit}
            _hover={{ bg: "gray.700" }}
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
