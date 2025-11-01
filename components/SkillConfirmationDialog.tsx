"use client";

import { Button, VStack, HStack, Text, Box } from "@chakra-ui/react";
import {
  DialogRoot,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { useState, useEffect } from "react";
import { useColorMode } from "@/components/ui/color-mode";

interface SkillMatch {
  skillName: string;
  hasExistingData: boolean;
  currentLevel: string | null;
  skillId: string | null;
}

interface SkillConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  requiredSkills: SkillMatch[];
  onConfirm: (confirmedSkills: Array<{
    skill_name: string;
    proficiency_level: string;
    id?: string | null;
  }>) => void;
  isLoading?: boolean;
}

const PROFICIENCY_LEVELS = ["beginner", "medium", "advanced", "expert"];

export default function SkillConfirmationDialog({
  isOpen,
  onClose,
  requiredSkills,
  onConfirm,
  isLoading = false,
}: SkillConfirmationDialogProps) {
  const { colorMode } = useColorMode();
  const [skillLevels, setSkillLevels] = useState<{
    [skillName: string]: string;
  }>({});

  useEffect(() => {
    if (isOpen && requiredSkills.length > 0) {
      const initialLevels: { [key: string]: string } = {};
      requiredSkills.forEach((skill) => {
        initialLevels[skill.skillName] =
          skill.currentLevel || "beginner";
      });
      setSkillLevels(initialLevels);
    }
  }, [isOpen, requiredSkills]);

  const handleLevelChange = (skillName: string, level: string) => {
    setSkillLevels((prev) => ({
      ...prev,
      [skillName]: level,
    }));
  };

  const handleConfirm = () => {
    const confirmedSkills = requiredSkills.map((skill) => ({
      skill_name: skill.skillName,
      proficiency_level: skillLevels[skill.skillName] || "beginner",
      id: skill.skillId || null,
    }));
    onConfirm(confirmedSkills);
  };

  const skillsWithData = requiredSkills.filter((s) => s.hasExistingData);
  const skillsWithoutData = requiredSkills.filter((s) => !s.hasExistingData);

  return (
    <DialogRoot open={isOpen} onOpenChange={(details) => !details.open && onClose()}>
      <DialogContent maxW="700px" maxH="80vh" overflowY="auto">
        <DialogHeader>
          <DialogTitle>Confirm Your Skill Levels</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <VStack gap={4} align="stretch">
            <Text fontSize="sm" color="gray.500">
              Please review and confirm your current skill levels. This helps us
              create a personalized curriculum that builds on what you already
              know.
            </Text>

            {skillsWithData.length > 0 && (
              <Box>
                <Text fontWeight="bold" mb={2}>
                  Skills Found in Your Profile
                </Text>
                <VStack gap={3} align="stretch">
                  {skillsWithData.map((skill) => (
                    <HStack key={skill.skillName} justify="space-between">
                      <Text flex={1}>{skill.skillName}</Text>
                      <select
                        value={skillLevels[skill.skillName] || skill.currentLevel || "beginner"}
                        onChange={(e) =>
                          handleLevelChange(skill.skillName, e.target.value)
                        }
                        style={{
                          width: "200px",
                          maxWidth: "200px",
                          padding: "8px",
                          borderRadius: "4px",
                          border: "1px solid #e2e8f0",
                          backgroundColor:
                            colorMode === "dark" ? "#000" : "transparent",
                          color: colorMode === "dark" ? "#fff" : "inherit",
                        }}
                      >
                        {PROFICIENCY_LEVELS.map((level) => (
                          <option key={level} value={level}>
                            {level.charAt(0).toUpperCase() + level.slice(1)}
                          </option>
                        ))}
                      </select>
                    </HStack>
                  ))}
                </VStack>
              </Box>
            )}

            {skillsWithoutData.length > 0 && (
              <Box>
                <Text fontWeight="bold" mb={2}>
                  New Skills (Please set your level)
                </Text>
                <VStack gap={3} align="stretch">
                  {skillsWithoutData.map((skill) => (
                    <HStack key={skill.skillName} justify="space-between">
                      <Text flex={1}>{skill.skillName}</Text>
                      <select
                        value={skillLevels[skill.skillName] || "beginner"}
                        onChange={(e) =>
                          handleLevelChange(skill.skillName, e.target.value)
                        }
                        style={{
                          width: "200px",
                          maxWidth: "200px",
                          padding: "8px",
                          borderRadius: "4px",
                          border: "1px solid #e2e8f0",
                          backgroundColor:
                            colorMode === "dark" ? "#000" : "transparent",
                          color: colorMode === "dark" ? "#fff" : "inherit",
                        }}
                      >
                        {PROFICIENCY_LEVELS.map((level) => (
                          <option key={level} value={level}>
                            {level.charAt(0).toUpperCase() + level.slice(1)}
                          </option>
                        ))}
                      </select>
                    </HStack>
                  ))}
                </VStack>
              </Box>
            )}
          </VStack>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" mr={3} onClick={onClose}>
            Cancel
          </Button>
          <Button
            colorScheme="blue"
            onClick={handleConfirm}
            isLoading={isLoading}
          >
            Confirm & Generate Curriculum
          </Button>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}

