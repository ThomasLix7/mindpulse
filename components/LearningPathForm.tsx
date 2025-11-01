"use client";

import { Button, Input, Textarea, VStack } from "@chakra-ui/react";
import {
  DialogRoot,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { useState } from "react";
import { DOMAIN_NAMES, getSubjectsByDomain, LEVELS } from "@/utils/constants";
import { useColorMode } from "@/components/ui/color-mode";

interface LearningPathFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: LearningPathFormData) => void;
  isLoading?: boolean;
}

export interface LearningPathFormData {
  title: string;
  goal: string;
  domain?: string;
  subject?: string;
  level: string;
}

export default function LearningPathForm({
  isOpen,
  onClose,
  onSubmit,
  isLoading = false,
}: LearningPathFormProps) {
  const { colorMode } = useColorMode();
  const [formData, setFormData] = useState<LearningPathFormData>({
    title: "",
    goal: "",
    domain: "",
    subject: "",
    level: "medium",
  });
  const [customLevel, setCustomLevel] = useState("");
  const [showCustomLevel, setShowCustomLevel] = useState(false);

  const availableSubjects = formData.domain
    ? getSubjectsByDomain(formData.domain)
    : [];

  const handleClose = () => {
    setFormData({
      title: "",
      goal: "",
      domain: "",
      subject: "",
      level: "medium",
    });
    setCustomLevel("");
    setShowCustomLevel(false);
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.goal) {
      return;
    }
    const submitData = {
      ...formData,
      level: showCustomLevel && customLevel ? customLevel : formData.level,
    };
    onSubmit(submitData);
  };

  return (
    <DialogRoot
      open={isOpen}
      onOpenChange={(details) => !details.open && handleClose()}
    >
      <DialogContent maxW="600px">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create New Learning Path</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <VStack gap={4} align="stretch">
              <div>
                <label
                  style={{
                    display: "block",
                    marginBottom: "8px",
                    fontWeight: "500",
                  }}
                >
                  Title <span style={{ color: "red" }}>*</span>
                </label>
                <Input
                  value={formData.title}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    const value = e.target.value.toUpperCase().slice(0, 20);
                    setFormData({ ...formData, title: value });
                  }}
                  placeholder="e.g., PATH TO DATA SCIENTIST"
                  maxLength={20}
                  required
                />
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    marginBottom: "8px",
                    fontWeight: "500",
                  }}
                >
                  Learning Goal <span style={{ color: "red" }}>*</span>
                </label>
                <Textarea
                  value={formData.goal}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    setFormData({ ...formData, goal: e.target.value })
                  }
                  placeholder="Describe what you want to achieve..."
                  rows={3}
                  required
                />
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    marginBottom: "8px",
                    fontWeight: "500",
                  }}
                >
                  Domain
                </label>
                <select
                  value={formData.domain}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                    setFormData({
                      ...formData,
                      domain: e.target.value,
                      subject: "",
                    });
                  }}
                  style={{
                    width: "100%",
                    padding: "8px",
                    borderRadius: "4px",
                    border: "1px solid #e2e8f0",
                    backgroundColor:
                      colorMode === "dark" ? "#000" : "transparent",
                    color: colorMode === "dark" ? "#fff" : "inherit",
                  }}
                >
                  <option value="">Select domain</option>
                  {DOMAIN_NAMES.map((domain) => (
                    <option key={domain} value={domain}>
                      {domain}
                    </option>
                  ))}
                </select>
              </div>

              {formData.domain && (
                <div>
                  <label
                    style={{
                      display: "block",
                      marginBottom: "8px",
                      fontWeight: "500",
                    }}
                  >
                    Subject
                  </label>
                  <select
                    value={formData.subject}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                      setFormData({ ...formData, subject: e.target.value })
                    }
                    style={{
                      width: "100%",
                      padding: "8px",
                      borderRadius: "4px",
                      border: "1px solid #e2e8f0",
                      backgroundColor:
                        colorMode === "dark" ? "#000" : "transparent",
                      color: colorMode === "dark" ? "#fff" : "inherit",
                    }}
                  >
                    <option value="">Select subject</option>
                    {availableSubjects.map((subject) => (
                      <option key={subject} value={subject}>
                        {subject}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label
                  style={{
                    display: "block",
                    marginBottom: "8px",
                    fontWeight: "500",
                  }}
                >
                  Target Level
                </label>
                <select
                  value={showCustomLevel ? "custom" : formData.level}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                    if (e.target.value === "custom") {
                      setShowCustomLevel(true);
                    } else {
                      setShowCustomLevel(false);
                      setFormData({ ...formData, level: e.target.value });
                    }
                  }}
                  style={{
                    width: "100%",
                    padding: "8px",
                    borderRadius: "4px",
                    border: "1px solid #e2e8f0",
                    backgroundColor:
                      colorMode === "dark" ? "#000" : "transparent",
                    color: colorMode === "dark" ? "#fff" : "inherit",
                  }}
                >
                  {LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {level.charAt(0).toUpperCase() + level.slice(1)}
                    </option>
                  ))}
                  <option value="custom">Others</option>
                </select>
                {showCustomLevel && (
                  <Input
                    value={customLevel}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setCustomLevel(e.target.value)
                    }
                    placeholder="Enter custom target level"
                    mt={2}
                  />
                )}
              </div>
            </VStack>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" mr={3} onClick={handleClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              colorScheme="blue"
              isLoading={isLoading}
              isDisabled={!formData.title || !formData.goal}
            >
              Create Learning Path
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </DialogRoot>
  );
}
