"use client";

import {
  Button,
  Box,
  Text,
  VStack,
  HStack,
  Textarea,
  Code,
  Spinner,
  Link,
} from "@chakra-ui/react";
import {
  DialogRoot,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogCloseTrigger,
} from "@/components/ui/dialog";
import { RadioGroup, Radio } from "@/components/ui/radio";
import { useColorMode } from "@/components/ui/color-mode";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { apiFetch } from "@/utils/api-fetch";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import {
  vscDarkPlus,
  okaidia,
} from "react-syntax-highlighter/dist/cjs/styles/prism";

interface AssessmentItem {
  id: string;
  item_order: number;
  item_type: string;
  question_text: string;
  correct_answer?: string;
  user_answer?: string;
  is_correct?: boolean;
  error_type?: string | null;
  concepts?: string[];
  level?: string;
}

interface Assessment {
  id: string;
  status: string;
  total_items: number;
  completed_items: number;
  overall_score?: number;
  metadata?: {
    topic?: string;
    concepts?: string[];
  };
}

interface AssessmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  assessmentId: string;
  courseId: string;
  userId: string;
  onComplete: (assessmentId: string, allPassed: boolean) => void;
  onResultsReady: (assessmentId: string, results: any) => void;
}

export function AssessmentModal({
  isOpen,
  onClose,
  assessmentId,
  courseId,
  userId,
  onComplete,
  onResultsReady,
}: AssessmentModalProps) {
  const { colorMode } = useColorMode();
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [items, setItems] = useState<AssessmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, any>>({});
  const [error, setError] = useState<string | null>(null);
  const textareaRefs = useRef<Record<number, HTMLTextAreaElement | null>>({});
  const rafRefs = useRef<Record<number, number | null>>({});

  const markdownComponents = useMemo(
    () => ({
      p: ({ children }: any) => (
        <Text as="p" mb={2} lineHeight="1.6">
          {children}
        </Text>
      ),
      h1: ({ children }: any) => (
        <Text as="h1" fontSize="2xl" fontWeight="bold" mb={3}>
          {children}
        </Text>
      ),
      h2: ({ children }: any) => (
        <Text as="h2" fontSize="xl" fontWeight="bold" mb={2}>
          {children}
        </Text>
      ),
      h3: ({ children }: any) => (
        <Text as="h3" fontSize="lg" fontWeight="semibold" mb={2}>
          {children}
        </Text>
      ),
      ul: ({ children }: any) => (
        <Box as="ul" pl={4} mb={2} listStyleType="disc">
          {children}
        </Box>
      ),
      ol: ({ children }: any) => (
        <Box as="ol" pl={4} mb={2} listStyleType="decimal">
          {children}
        </Box>
      ),
      li: ({ children }: any) => (
        <Text as="li" mb={1}>
          {children}
        </Text>
      ),
      code: ({ inline, children, className }: any) => {
        const match = /language-(\w+)/.exec(className || "");
        const language = match ? match[1] : "";
        return !inline && language ? (
          <Box mb={3} borderRadius="md" overflow="hidden">
            <SyntaxHighlighter
              style={colorMode === "dark" ? vscDarkPlus : okaidia}
              language={language}
              PreTag="div"
              customStyle={{
                borderRadius: "6px",
                padding: "12px",
                margin: 0,
              }}
            >
              {String(children).replace(/\n$/, "")}
            </SyntaxHighlighter>
          </Box>
        ) : (
          <Code
            fontSize="sm"
            px={2}
            py={1}
            borderRadius="md"
            bg={colorMode === "dark" ? "gray.700" : "gray.100"}
            color={colorMode === "dark" ? "gray.100" : "gray.800"}
          >
            {children}
          </Code>
        );
      },
      pre: ({ children }: any) => <Box as="pre">{children}</Box>,
      blockquote: ({ children }: any) => (
        <Box
          as="blockquote"
          pl={4}
          borderLeft="4px solid"
          borderColor={colorMode === "dark" ? "gray.600" : "gray.300"}
          my={2}
          fontStyle="italic"
          color={colorMode === "dark" ? "gray.300" : "gray.700"}
        >
          {children}
        </Box>
      ),
      strong: ({ children }: any) => (
        <Text as="strong" fontWeight="bold">
          {children}
        </Text>
      ),
      em: ({ children }: any) => (
        <Text as="em" fontStyle="italic">
          {children}
        </Text>
      ),
      a: ({ href, children }: any) => (
        <Link
          href={href}
          color="blue.500"
          textDecoration="underline"
          _hover={{ color: "blue.600" }}
          target="_blank"
          rel="noopener noreferrer"
        >
          {children}
        </Link>
      ),
      br: () => <Box as="br" />,
    }),
    [colorMode]
  );

  const adjustTextareaHeight = useCallback(
    (itemIndex: number, target: HTMLTextAreaElement) => {
      if (rafRefs.current[itemIndex]) {
        cancelAnimationFrame(rafRefs.current[itemIndex]!);
      }
      rafRefs.current[itemIndex] = requestAnimationFrame(() => {
        if (target) {
          target.style.height = "auto";
          void target.offsetHeight;
          const scrollHeight = target.scrollHeight;
          const minHeight = 100;
          const maxHeight =
            itemIndex >= 0 && items[itemIndex]?.item_type === "coding_exercise"
              ? 600
              : 300;
          const newHeight = Math.max(
            minHeight,
            Math.min(scrollHeight, maxHeight)
          );
          target.style.height = `${newHeight}px`;
          target.style.overflowY = scrollHeight > maxHeight ? "auto" : "hidden";
        }
      });
    },
    [items]
  );

  useEffect(() => {
    if (isOpen && assessmentId) {
      if (assessmentId === "generating") {
        setLoading(true);
        setAssessment(null);
        setItems([]);
      } else {
        loadAssessment();
      }
    }
  }, [isOpen, assessmentId]);

  useEffect(() => {
    // Adjust textarea height when navigating to question with existing answer
    if (currentIndex >= 0 && items[currentIndex]) {
      const textarea = textareaRefs.current[currentIndex];
      const item = items[currentIndex];
      if (
        textarea &&
        item.item_type !== "multiple_choice" &&
        item.item_type !== "true_false"
      ) {
        setTimeout(() => {
          adjustTextareaHeight(currentIndex, textarea);
        }, 0);
      }
    }
  }, [currentIndex, items, adjustTextareaHeight]);

  const loadAssessment = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiFetch(`/api/assessments/${assessmentId}`);
      if (!response.ok) {
        throw new Error("Failed to load assessment");
      }
      const data = await response.json();
      setAssessment(data.assessment);
      setItems(data.items || []);

      // Restore previous answers
      const restoredAnswers: Record<number, any> = {};
      let firstUnansweredIndex: number | null = null;
      (data.items || []).forEach((item: any, index: number) => {
        if (item.user_answer) {
          let restoredAnswer = item.user_answer;
          if (item.item_type === "multiple_choice") {
            const letterMatch = item.user_answer.match(/^([A-Z])\)/);
            if (letterMatch) {
              restoredAnswer = letterMatch[1];
            } else if (!/^[A-Z]$/.test(item.user_answer)) {
              const letter = item.user_answer.charAt(0);
              if (/^[A-Z]$/.test(letter)) {
                restoredAnswer = letter;
              }
            }
          }
          restoredAnswers[index] = restoredAnswer;
        } else if (firstUnansweredIndex === null && !item.user_answer) {
          firstUnansweredIndex = index;
        }
      });
      setAnswers(restoredAnswers);
      // Go to first unanswered item, or last item if all answered
      setCurrentIndex(
        firstUnansweredIndex ?? Math.max(0, (data.items || []).length - 1)
      );

      // Adjust textarea heights for restored answers
      setTimeout(() => {
        Object.keys(restoredAnswers).forEach((key) => {
          const index = parseInt(key);
          const textarea = textareaRefs.current[index];
          if (
            textarea &&
            items[index]?.item_type !== "multiple_choice" &&
            items[index]?.item_type !== "true_false"
          ) {
            adjustTextareaHeight(index, textarea);
          }
        });
      }, 0);
    } catch (err: any) {
      setError(err.message || "Failed to load assessment");
    } finally {
      setLoading(false);
    }
  };

  const handleAnswerChange = (itemIndex: number, value: any) => {
    setAnswers((prev) => ({
      ...prev,
      [itemIndex]: value,
    }));

    const textarea = textareaRefs.current[itemIndex];
    if (textarea) {
      adjustTextareaHeight(itemIndex, textarea);
    }
  };

  const saveAnswersToDatabase = async () => {
    if (!assessmentId || !items.length || Object.keys(answers).length === 0) {
      return;
    }

    try {
      const updates = items
        .map((item, index) => {
          const answer = answers[index];
          if (answer !== undefined && answer !== "") {
            return {
              id: item.id,
              user_answer: answer,
            };
          }
          return null;
        })
        .filter((update) => update !== null) as Array<{
        id: string;
        user_answer: string;
      }>;

      if (updates.length === 0) return;

      // Use batch endpoint instead of individual calls
      await apiFetch(`/api/assessments/items/batch`, {
        method: "PATCH",
        body: JSON.stringify({
          updates,
        }),
      });
    } catch (error) {
      console.error("Error saving answers:", error);
    }
  };

  const handleNext = () => {
    if (currentIndex < items.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      setError(null);
      await saveAnswersToDatabase();

      const answersArray = items.map((_, index) => ({
        answer: answers[index] || "",
      }));

      const response = await apiFetch("/api/assessments/submit", {
        method: "POST",
        body: JSON.stringify({
          assessmentId,
          courseId,
          userId,
          answers: answersArray,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to submit assessment");
      }

      const data = await response.json();

      // Close this modal first
      onClose();

      // Then notify parent that results are ready (this will open results modal)
      onResultsReady(assessmentId, data);
    } catch (err: any) {
      setError(err.message || "Failed to submit assessment");
    } finally {
      setSubmitting(false);
    }
  };

  const renderQuestion = (item: AssessmentItem, index: number) => {
    const answer = answers[index];

    switch (item.item_type) {
      case "multiple_choice":
        let options: string[] = [];
        let questionText = item.question_text || "";
        // Extract options: Letter) followed by text until next option or end
        const optionRegex = /([A-Z])\)\s*(.*?)(?=\s*[A-Z]\)|$)/g;
        let match;
        const extractedOptions: {
          letter: string;
          text: string;
          index: number;
        }[] = [];

        while ((match = optionRegex.exec(questionText)) !== null) {
          extractedOptions.push({
            letter: match[1],
            text: match[2].trim(),
            index: match.index,
          });
        }

        if (extractedOptions.length > 0) {
          options = extractedOptions.map((opt) => `${opt.letter}) ${opt.text}`);
          const firstOptionIndex = extractedOptions[0].index;
          questionText = questionText.substring(0, firstOptionIndex).trim();
        } else if (item.correct_answer) {
          try {
            const parsed = JSON.parse(item.correct_answer);
            if (Array.isArray(parsed)) {
              options = parsed;
            } else {
              options = item.correct_answer.split("|").filter((o) => o.trim());
            }
          } catch {
            options = item.correct_answer.split("|").filter((o) => o.trim());
          }
        }

        if (options.length === 0) {
          options = [
            "A) Option A",
            "B) Option B",
            "C) Option C",
            "D) Option D",
          ];
        }

        return (
          <VStack gap={5} align="stretch">
            {questionText && (
              <Box
                pb={4}
                borderBottomWidth="2px"
                borderBottomColor={
                  colorMode === "dark" ? "gray.700" : "gray.200"
                }
              >
                <Box
                  fontWeight="semibold"
                  fontSize="lg"
                  lineHeight="1.6"
                  color={colorMode === "dark" ? "gray.100" : "gray.900"}
                >
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkBreaks]}
                    components={markdownComponents}
                  >
                    {questionText}
                  </ReactMarkdown>
                </Box>
              </Box>
            )}
            <Box pt={2}>
              <Text
                fontSize="sm"
                fontWeight="medium"
                color={colorMode === "dark" ? "gray.400" : "gray.600"}
                mb={3}
              >
                Select your answer:
              </Text>
              <RadioGroup
                value={answer || ""}
                onValueChange={(details) => {
                  handleAnswerChange(index, details.value);
                }}
              >
                <VStack gap={3} align="stretch">
                  {options.map((option, optIndex) => {
                    const optionLetter =
                      option.match(/^([A-Z])\)/)?.[1] || option.trim();
                    return (
                      <Box
                        key={optIndex}
                        p={3}
                        borderRadius="md"
                        borderWidth="1px"
                        borderColor={
                          colorMode === "dark" ? "gray.700" : "gray.200"
                        }
                        bg={colorMode === "dark" ? "gray.900" : "white"}
                        _hover={{
                          borderColor:
                            colorMode === "dark" ? "gray.600" : "gray.300",
                          bg: colorMode === "dark" ? "gray.850" : "gray.50",
                        }}
                        transition="all 0.2s"
                      >
                        <Radio value={optionLetter}>
                          <Text
                            fontSize="md"
                            color={
                              colorMode === "dark" ? "gray.200" : "gray.800"
                            }
                          >
                            {option.trim()}
                          </Text>
                        </Radio>
                      </Box>
                    );
                  })}
                </VStack>
              </RadioGroup>
            </Box>
          </VStack>
        );

      case "true_false":
        return (
          <Box pt={2}>
            <Text
              fontSize="sm"
              fontWeight="medium"
              color={colorMode === "dark" ? "gray.400" : "gray.600"}
              mb={4}
            >
              Select your answer:
            </Text>
            <RadioGroup
              value={answer || ""}
              onValueChange={(details) => {
                handleAnswerChange(index, details.value);
              }}
            >
              <HStack gap={4}>
                <Box
                  p={4}
                  borderRadius="md"
                  borderWidth="1px"
                  borderColor={colorMode === "dark" ? "gray.700" : "gray.200"}
                  bg={colorMode === "dark" ? "gray.900" : "white"}
                  _hover={{
                    borderColor: colorMode === "dark" ? "gray.600" : "gray.300",
                    bg: colorMode === "dark" ? "gray.850" : "gray.50",
                  }}
                  transition="all 0.2s"
                  flex={1}
                >
                  <Radio value="true">
                    <Text
                      fontSize="md"
                      fontWeight="medium"
                      color={colorMode === "dark" ? "gray.200" : "gray.800"}
                    >
                      True
                    </Text>
                  </Radio>
                </Box>
                <Box
                  p={4}
                  borderRadius="md"
                  borderWidth="1px"
                  borderColor={colorMode === "dark" ? "gray.700" : "gray.200"}
                  bg={colorMode === "dark" ? "gray.900" : "white"}
                  _hover={{
                    borderColor: colorMode === "dark" ? "gray.600" : "gray.300",
                    bg: colorMode === "dark" ? "gray.850" : "gray.50",
                  }}
                  transition="all 0.2s"
                  flex={1}
                >
                  <Radio value="false">
                    <Text
                      fontSize="md"
                      fontWeight="medium"
                      color={colorMode === "dark" ? "gray.200" : "gray.800"}
                    >
                      False
                    </Text>
                  </Radio>
                </Box>
              </HStack>
            </RadioGroup>
          </Box>
        );

      case "short_answer":
        return (
          <Box pt={2}>
            <Text
              fontSize="sm"
              fontWeight="medium"
              color={colorMode === "dark" ? "gray.400" : "gray.600"}
              mb={3}
            >
              Type your answer:
            </Text>
            <Textarea
              ref={(el) => {
                textareaRefs.current[index] = el;
              }}
              value={answer || ""}
              onChange={(e) => {
                handleAnswerChange(index, e.target.value);
                adjustTextareaHeight(index, e.target);
              }}
              placeholder="Type your answer here..."
              fontSize="md"
              p={4}
              borderWidth="2px"
              borderColor={colorMode === "dark" ? "gray.700" : "gray.300"}
              resize="none"
              minH="100px"
              maxH="300px"
              style={{
                height: "auto",
                lineHeight: "1.5",
              }}
              _focus={{
                borderColor: "blue.500",
                boxShadow: "0 0 0 1px var(--chakra-colors-blue-500)",
              }}
            />
          </Box>
        );

      case "coding_exercise":
        return (
          <Box pt={2}>
            <Text
              fontSize="sm"
              fontWeight="medium"
              color={colorMode === "dark" ? "gray.400" : "gray.600"}
              mb={3}
            >
              Write your code:
            </Text>
            <Textarea
              ref={(el) => {
                textareaRefs.current[index] = el;
              }}
              value={answer || ""}
              onChange={(e) => {
                handleAnswerChange(index, e.target.value);
                adjustTextareaHeight(index, e.target);
              }}
              placeholder="Write your code here..."
              fontFamily="mono"
              fontSize="md"
              p={4}
              borderWidth="2px"
              borderColor={colorMode === "dark" ? "gray.700" : "gray.300"}
              bg={colorMode === "dark" ? "gray.900" : "white"}
              resize="none"
              minH="150px"
              maxH="600px"
              style={{
                height: "auto",
                lineHeight: "1.5",
              }}
              _focus={{
                borderColor: "blue.500",
                boxShadow: "0 0 0 1px var(--chakra-colors-blue-500)",
              }}
            />
            <Text
              fontSize="sm"
              color={colorMode === "dark" ? "gray.500" : "gray.600"}
              mt={3}
            >
              Write executable code that solves the problem
            </Text>
          </Box>
        );

      case "fill_blank":
        return (
          <Box pt={2}>
            <Text
              fontSize="sm"
              fontWeight="medium"
              color={colorMode === "dark" ? "gray.400" : "gray.600"}
              mb={3}
            >
              Fill in the blank:
            </Text>
            <Textarea
              ref={(el) => {
                textareaRefs.current[index] = el;
              }}
              value={answer || ""}
              onChange={(e) => {
                handleAnswerChange(index, e.target.value);
                adjustTextareaHeight(index, e.target);
              }}
              placeholder="Fill in the blank..."
              fontSize="md"
              p={4}
              borderWidth="2px"
              borderColor={colorMode === "dark" ? "gray.700" : "gray.300"}
              resize="none"
              minH="80px"
              maxH="300px"
              style={{
                height: "auto",
                lineHeight: "1.5",
              }}
              _focus={{
                borderColor: "blue.500",
                boxShadow: "0 0 0 1px var(--chakra-colors-blue-500)",
              }}
            />
          </Box>
        );

      default:
        return (
          <Box pt={2}>
            <Text
              fontSize="sm"
              fontWeight="medium"
              color={colorMode === "dark" ? "gray.400" : "gray.600"}
              mb={3}
            >
              Type your answer:
            </Text>
            <Textarea
              ref={(el) => {
                textareaRefs.current[index] = el;
              }}
              value={answer || ""}
              onChange={(e) => {
                handleAnswerChange(index, e.target.value);
                adjustTextareaHeight(index, e.target);
              }}
              placeholder="Type your answer here..."
              fontSize="md"
              p={4}
              borderWidth="2px"
              borderColor={colorMode === "dark" ? "gray.700" : "gray.300"}
              resize="none"
              minH="100px"
              maxH="300px"
              style={{
                height: "auto",
                lineHeight: "1.5",
              }}
              _focus={{
                borderColor: "blue.500",
                boxShadow: "0 0 0 1px var(--chakra-colors-blue-500)",
              }}
            />
          </Box>
        );
    }
  };

  const progress =
    items.length > 0 ? ((currentIndex + 1) / items.length) * 100 : 0;
  const answeredCount = Object.keys(answers).filter(
    (key) =>
      answers[parseInt(key)] !== undefined && answers[parseInt(key)] !== ""
  ).length;

  const handleClose = () => {
    if (answeredCount > 0 && answeredCount < items.length) {
      const confirmed = window.confirm(
        `You have answered ${answeredCount} out of ${items.length} questions. Are you sure you want to close? Your progress will be saved.`
      );
      if (!confirmed) return;
    }

    onClose();
    saveAnswersToDatabase().catch((error) => {
      console.error("Error saving answers in background:", error);
    });
  };

  if (loading) {
    return (
      <DialogRoot
        open={isOpen}
        onOpenChange={(details) => !details.open && handleClose()}
      >
        <DialogContent maxW="4xl" w="90vw">
          <DialogHeader>
            <DialogTitle>
              {assessmentId === "generating"
                ? "Generating Assessment"
                : "Loading Assessment"}
            </DialogTitle>
            <DialogCloseTrigger />
          </DialogHeader>
          <DialogBody py={8}>
            <VStack gap={4}>
              <Spinner size="lg" />
              <Text fontSize="lg">
                {assessmentId === "generating"
                  ? "Creating your assessment questions..."
                  : "Loading assessment..."}
              </Text>
            </VStack>
          </DialogBody>
        </DialogContent>
      </DialogRoot>
    );
  }

  if (submitting) {
    return (
      <DialogRoot
        open={isOpen}
        onOpenChange={(details) => !details.open && handleClose()}
      >
        <DialogContent maxW="4xl" w="90vw">
          <DialogHeader>
            <DialogTitle>Analyzing Your Answers</DialogTitle>
            <DialogCloseTrigger />
          </DialogHeader>
          <DialogBody py={8}>
            <VStack gap={4}>
              <Spinner size="lg" />
              <Text fontSize="lg">Analyzing your answers...</Text>
            </VStack>
          </DialogBody>
        </DialogContent>
      </DialogRoot>
    );
  }

  const currentItem = items[currentIndex];

  return (
    <DialogRoot
      open={isOpen}
      onOpenChange={(details) => !details.open && handleClose()}
    >
      <DialogContent maxW="4xl" w="90vw" maxH="90vh" overflowY="auto">
        <DialogHeader>
          <DialogTitle fontSize="xl">
            Assessment: {assessment?.metadata?.topic || "Topic Assessment"}
          </DialogTitle>
          <DialogCloseTrigger />
        </DialogHeader>
        <DialogBody py={6}>
          <VStack gap={6} align="stretch">
            {error && (
              <Box
                p={4}
                borderRadius="md"
                bg="red.50"
                borderWidth="1px"
                borderColor="red.200"
              >
                <Text color="red.600" fontSize="md">
                  {error}
                </Text>
              </Box>
            )}

            <Box>
              <HStack justify="space-between" mb={3}>
                <Text fontSize="md" color="gray.600">
                  Question {currentIndex + 1} of {items.length}
                </Text>
                <Text fontSize="md" color="gray.600">
                  {answeredCount} answered
                </Text>
              </HStack>
              <Box
                w="100%"
                h="8px"
                bg={colorMode === "dark" ? "gray.700" : "gray.200"}
                borderRadius="full"
                overflow="hidden"
              >
                <Box
                  h="100%"
                  bg="blue.500"
                  w={`${progress}%`}
                  transition="width 0.3s"
                />
              </Box>
            </Box>

            <Box
              p={6}
              borderRadius="md"
              bg={colorMode === "dark" ? "gray.800" : "gray.50"}
            >
              {currentItem?.item_type !== "multiple_choice" && (
                <Box
                  mb={5}
                  pb={4}
                  borderBottomWidth="2px"
                  borderBottomColor={
                    colorMode === "dark" ? "gray.700" : "gray.200"
                  }
                >
                  <Box
                    fontWeight="semibold"
                    fontSize="lg"
                    lineHeight="1.6"
                    color={colorMode === "dark" ? "gray.100" : "gray.900"}
                  >
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkBreaks]}
                      components={markdownComponents}
                    >
                      {currentItem?.question_text || ""}
                    </ReactMarkdown>
                  </Box>
                </Box>
              )}
              {currentItem && renderQuestion(currentItem, currentIndex)}
            </Box>
          </VStack>
        </DialogBody>
        <DialogFooter>
          <HStack gap={2}>
            <Button
              onClick={handlePrevious}
              isDisabled={currentIndex === 0}
              variant="outline"
            >
              Previous
            </Button>
            {currentIndex < items.length - 1 ? (
              <Button
                onClick={handleNext}
                colorScheme="blue"
                isDisabled={!answers[currentIndex]}
              >
                Next
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                colorScheme="green"
                isLoading={submitting}
                isDisabled={answeredCount < items.length}
              >
                Submit Assessment
              </Button>
            )}
          </HStack>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}
