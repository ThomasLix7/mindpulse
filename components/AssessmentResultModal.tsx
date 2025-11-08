"use client";

import {
  Button,
  Box,
  Text,
  VStack,
  HStack,
  Spinner,
  Code,
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
import { useState, useEffect, useMemo, useRef } from "react";
import { apiFetch } from "@/utils/api-fetch";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import {
  vscDarkPlus,
  okaidia,
} from "react-syntax-highlighter/dist/cjs/styles/prism";
import { useColorMode } from "@/components/ui/color-mode";

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
}

interface AssessmentResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  assessmentId: string;
  courseId: string;
  userId: string;
  results: {
    score: number;
    correctCount: number;
    totalItems: number;
    allPassed: boolean;
    failedConcepts?: string[];
  };
  onReadyForRevision: () => void;
}

export function AssessmentResultModal({
  isOpen,
  onClose,
  assessmentId,
  courseId,
  userId,
  results,
  onReadyForRevision,
}: AssessmentResultModalProps) {
  const { colorMode } = useColorMode();
  const [items, setItems] = useState<AssessmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const justOpenedRef = useRef(false);
  const summaryCacheRef = useRef<Map<string, string>>(new Map());

  const markdownComponents = useMemo(
    () => ({
      p: ({ children }: any) => (
        <Text as="p" mb={4} lineHeight="1.8" fontSize="lg">
          {children}
        </Text>
      ),
      h1: ({ children }: any) => (
        <Text as="h1" fontSize="3xl" fontWeight="bold" mb={4} mt={6}>
          {children}
        </Text>
      ),
      h2: ({ children }: any) => (
        <Text as="h2" fontSize="2xl" fontWeight="bold" mb={3} mt={5}>
          {children}
        </Text>
      ),
      h3: ({ children }: any) => (
        <Text as="h3" fontSize="xl" fontWeight="semibold" mb={3} mt={4}>
          {children}
        </Text>
      ),
      ul: ({ children }: any) => (
        <Box as="ul" pl={6} mb={4}>
          {children}
        </Box>
      ),
      ol: ({ children }: any) => (
        <Box as="ol" pl={6} mb={4}>
          {children}
        </Box>
      ),
      li: ({ children }: any) => {
        // Convert children to string for pattern matching
        const getTextContent = (node: any): string => {
          if (typeof node === "string") return node;
          if (typeof node === "number") return String(node);
          if (Array.isArray(node)) return node.map(getTextContent).join("");
          if (node?.props?.children) return getTextContent(node.props.children);
          return "";
        };
        
        const text = getTextContent(children);
        
        // Pattern 1: "Item X (ErrorType):" - assessment item with error type
        const itemMatch = text.match(/^(Item\s+\d+)\s*(\([^)]+\))?\s*:/);
        if (itemMatch) {
          const itemNumber = itemMatch[1];
          const errorType = itemMatch[2] || "";
          const description = text.replace(/^Item\s+\d+\s*(\([^)]+\))?\s*:\s*/, "");
          
          return (
            <Box as="li" mb={4} lineHeight="1.8">
              <HStack align="start" gap={2} mb={2} flexWrap="wrap">
                <Box
                  px={3}
                  py={1}
                  borderRadius="md"
                  bg={colorMode === "dark" ? "rgba(37, 99, 235, 0.3)" : "rgba(37, 99, 235, 0.15)"}
                  color={colorMode === "dark" ? "blue.300" : "blue.700"}
                  fontSize="sm"
                  fontWeight="bold"
                >
                  {itemNumber}
                </Box>
                {errorType && (
                  <Box
                    px={3}
                    py={1}
                    borderRadius="md"
                  bg={colorMode === "dark" ? "rgba(239, 68, 68, 0.2)" : "rgba(239, 68, 68, 0.12)"}
                  color={colorMode === "dark" ? "red.400" : "red.600"}
                    fontSize="sm"
                    fontWeight="semibold"
                  >
                    {errorType}
                  </Box>
                )}
              </HStack>
              <Text fontSize="lg" lineHeight="1.8" pl={2}>
                {description}
              </Text>
            </Box>
          );
        }
        
        // Pattern 2: Section headers (ends with colon, likely a heading)
        // Examples: "You've shown a good grasp of:", "Areas That Need Significant Revision and Practice:"
        const sectionHeaderMatch = text.match(/^([^:]+):\s*$/);
        if (sectionHeaderMatch) {
          return (
            <Box as="li" mb={3} mt={4}>
              <Text
                fontSize="xl"
                fontWeight="bold"
                color={colorMode === "dark" ? "white" : "inherit"}
                mb={2}
              >
                {text}
              </Text>
            </Box>
          );
        }
        
        // Pattern 3: Sub-items with labels (has colon but not at the end)
        // Examples: "Basic Tuple Concepts: You understand...", "Core Python Syntax & Error Types: Understanding..."
        const subItemMatch = text.match(/^([^:]+):\s*(.+)$/);
        if (subItemMatch) {
          const label = subItemMatch[1].trim();
          const description = subItemMatch[2].trim();
          
          return (
            <Box as="li" mb={3} lineHeight="1.8">
              <HStack align="start" gap={2} mb={1}>
                <Box
                  px={3}
                  py={1}
                  borderRadius="md"
                  bg={colorMode === "dark" ? "rgba(16, 185, 129, 0.15)" : "rgba(16, 185, 129, 0.08)"}
                  color={colorMode === "dark" ? "green.400" : "green.600"}
                  fontSize="sm"
                  fontWeight="semibold"
                >
                  {label}:
                </Box>
              </HStack>
              <Text fontSize="lg" lineHeight="1.8" pl={2}>
                {description}
              </Text>
            </Box>
          );
        }
        
        // Default: regular list item
        return (
          <Text as="li" mb={2} lineHeight="1.8" fontSize="lg">
            {children}
          </Text>
        );
      },
      code: ({ inline, children, className }: any) => {
        const match = /language-(\w+)/.exec(className || "");
        const language = match ? match[1] : "";
        const codeString = String(children).replace(/\n$/, "");

        if (!inline && language) {
          return (
            <Box my={4}>
              <SyntaxHighlighter
                style={colorMode === "dark" ? vscDarkPlus : okaidia}
                language={language}
                PreTag="div"
              >
                {codeString}
              </SyntaxHighlighter>
            </Box>
          );
        }

        return (
          <Code
            px={2}
            py={1}
            borderRadius="md"
            fontSize="md"
            bg="gray.100"
            color="gray.800"
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
          borderColor="gray.300"
          my={4}
          fontStyle="italic"
          fontSize="lg"
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
        <Link href={href} color="blue.500" textDecoration="underline">
          {children}
        </Link>
      ),
      br: () => <Box as="br" />,
    }),
    [colorMode]
  );

  useEffect(() => {
    if (isOpen && assessmentId) {
      justOpenedRef.current = true;
      setTimeout(() => {
        justOpenedRef.current = false;
      }, 500);
      
      setLoading(true);
      setLoadingSummary(false);
      loadAssessment();
    }
  }, [isOpen, assessmentId]);

  const loadAssessment = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiFetch(`/api/assessments/${assessmentId}`);
      if (!response.ok) {
        throw new Error("Failed to load assessment");
      }
      const data = await response.json();
      setItems(data.items || []);
      
      // Load summary from assessment metadata if available
      const summary = data.assessment?.metadata?.summary;
      if (summary) {
        setAiSummary(summary);
        summaryCacheRef.current.set(assessmentId, summary);
      } else {
        // Only fetch if summary not in metadata and not in cache
        const cachedSummary = summaryCacheRef.current.get(assessmentId);
        if (!cachedSummary) {
          fetchSummary();
        } else {
          setAiSummary(cachedSummary);
        }
      }
    } catch (err: any) {
      setError(err.message || "Failed to load assessment");
    } finally {
      setLoading(false);
    }
  };

  const fetchSummary = async () => {
    try {
      setLoadingSummary(true);
      setError(null);

      const response = await apiFetch(`/api/assessments/${assessmentId}/summary`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to get AI summary");
      }

      const data = await response.json();
      setAiSummary(data.summary);
      
      if (assessmentId) {
        summaryCacheRef.current.set(assessmentId, data.summary);
      }
    } catch (err: any) {
      setError(err.message || "Failed to get AI summary");
    } finally {
      setLoadingSummary(false);
    }
  };

  const handleReadyForRevisionClick = async () => {
    onReadyForRevision();
  };

  const handleOpenChange = (details: { open: boolean }) => {
    // Prevent closing if modal just opened (within 500ms)
    if (!details.open && isOpen && justOpenedRef.current) {
      return;
    }
    
    // Only close if explicitly requested (user clicked close or backdrop)
    // AND the modal is currently open (to prevent closing during initial open)
    if (!details.open && isOpen) {
      onClose();
    }
  };

  if (loading) {
    return (
      <DialogRoot open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent maxW="4xl" w="90vw">
          <DialogHeader>
            <DialogTitle>Loading Results</DialogTitle>
            <DialogCloseTrigger />
          </DialogHeader>
          <DialogBody py={8}>
            <VStack gap={4}>
              <Spinner size="lg" />
              <Text fontSize="lg">Loading assessment results...</Text>
            </VStack>
          </DialogBody>
        </DialogContent>
      </DialogRoot>
    );
  }

  return (
    <DialogRoot open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent maxW="6xl" w="95vw" maxH="90vh" overflowY="auto">
        <DialogHeader>
          <DialogTitle fontSize="2xl">Assessment Results</DialogTitle>
          <DialogCloseTrigger />
        </DialogHeader>
        <DialogBody>
          <VStack gap={6} align="stretch">
            <Box
              p={6}
              borderRadius="md"
              bg={results.allPassed 
                ? (colorMode === "dark" ? "rgba(16, 185, 129, 0.1)" : "rgba(16, 185, 129, 0.05)")
                : (colorMode === "dark" ? "rgba(234, 179, 8, 0.1)" : "rgba(234, 179, 8, 0.05)")}
              borderWidth="1px"
              borderColor={results.allPassed 
                ? (colorMode === "dark" ? "rgba(16, 185, 129, 0.2)" : "rgba(16, 185, 129, 0.15)")
                : (colorMode === "dark" ? "rgba(234, 179, 8, 0.2)" : "rgba(234, 179, 8, 0.15)")}
            >
              <Text fontWeight="bold" mb={2} fontSize="xl" color={colorMode === "dark" ? "white" : "inherit"}>
                {results.allPassed
                  ? "Congratulations!"
                  : "Assessment Complete"}
              </Text>
              <Text fontSize="lg" color={colorMode === "dark" ? "gray.100" : "inherit"}>
                Score: {results.score.toFixed(1)}% ({results.correctCount}/
                {results.totalItems} correct)
              </Text>
            </Box>

            <Box>
              <Text fontWeight="bold" mb={4} fontSize="xl" color={colorMode === "dark" ? "white" : "inherit"}>
                Detailed Results
              </Text>
              <VStack gap={4} align="stretch">
                {items.map((item, index) => {
                  const isCorrect = item.is_correct ?? false;
                  const userAnswer = item.user_answer || "No answer provided";
                  const correctAnswer = item.correct_answer || "";

                  return (
                    <Box
                      key={item.id}
                      p={4}
                      borderRadius="md"
                      borderWidth="1px"
                      borderColor={isCorrect 
                        ? (colorMode === "dark" ? "rgba(16, 185, 129, 0.2)" : "rgba(16, 185, 129, 0.15)")
                        : (colorMode === "dark" ? "rgba(239, 68, 68, 0.2)" : "rgba(239, 68, 68, 0.15)")}
                      bg={isCorrect 
                        ? (colorMode === "dark" ? "rgba(16, 185, 129, 0.1)" : "rgba(16, 185, 129, 0.05)")
                        : (colorMode === "dark" ? "rgba(239, 68, 68, 0.1)" : "rgba(239, 68, 68, 0.05)")}
                    >
                      <VStack gap={3} align="stretch">
                        <HStack justify="space-between" align="start">
                          <Text fontWeight="bold" fontSize="md" color={colorMode === "dark" ? "white" : "inherit"}>
                            Question {index + 1} (
                            {item.item_type.replace("_", " ")})
                          </Text>
                          <Box
                            px={3}
                            py={1}
                            borderRadius="full"
                            bg={isCorrect 
                              ? (colorMode === "dark" ? "rgba(16, 185, 129, 0.25)" : "rgba(16, 185, 129, 0.12)")
                              : (colorMode === "dark" ? "rgba(239, 68, 68, 0.25)" : "rgba(239, 68, 68, 0.12)")}
                            color={isCorrect 
                              ? (colorMode === "dark" ? "green.400" : "green.600")
                              : (colorMode === "dark" ? "red.400" : "red.600")}
                          >
                            <Text fontSize="sm" fontWeight="bold">
                              {isCorrect ? "✓ Correct" : "✗ Incorrect"}
                            </Text>
                          </Box>
                        </HStack>

                        <Box>
                          <Text
                            fontWeight="semibold"
                            mb={2}
                            fontSize="sm"
                            color={colorMode === "dark" ? "gray.300" : "gray.600"}
                          >
                            Question:
                          </Text>
                          <Box
                            p={3}
                            bg={colorMode === "dark" ? "rgba(0, 0, 0, 0.2)" : "rgba(255, 255, 255, 0.5)"}
                            borderRadius="md"
                            borderWidth="1px"
                            borderColor={colorMode === "dark" ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)"}
                          >
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm, remarkBreaks]}
                              components={markdownComponents}
                            >
                              {item.question_text}
                            </ReactMarkdown>
                          </Box>
                        </Box>

                        <Box>
                          <Text
                            fontWeight="semibold"
                            mb={2}
                            fontSize="sm"
                            color={colorMode === "dark" ? "gray.300" : "gray.600"}
                          >
                            Your Answer:
                          </Text>
                          <Box
                            p={3}
                            bg={colorMode === "dark" ? "rgba(0, 0, 0, 0.2)" : "rgba(255, 255, 255, 0.5)"}
                            borderRadius="md"
                            borderWidth="1px"
                            borderColor={colorMode === "dark" ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)"}
                          >
                            <Text fontSize="md" whiteSpace="pre-wrap" color={colorMode === "dark" ? "gray.100" : "inherit"}>
                              {userAnswer}
                            </Text>
                          </Box>
                        </Box>

                        {!isCorrect && correctAnswer && (
                          <Box>
                            <Text
                              fontWeight="semibold"
                              mb={2}
                              fontSize="sm"
                              color={colorMode === "dark" ? "gray.300" : "gray.600"}
                            >
                              Correct Answer:
                            </Text>
                            <Box
                              p={3}
                              bg={colorMode === "dark" ? "rgba(0, 0, 0, 0.2)" : "rgba(255, 255, 255, 0.5)"}
                              borderRadius="md"
                              borderWidth="1px"
                              borderColor={colorMode === "dark" ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)"}
                            >
                              <Text fontSize="md" whiteSpace="pre-wrap" color={colorMode === "dark" ? "gray.100" : "inherit"}>
                                {correctAnswer}
                              </Text>
                            </Box>
                          </Box>
                        )}

                        {item.error_type && (
                          <Box>
                            <Text
                              fontWeight="semibold"
                              mb={2}
                              fontSize="sm"
                              color={colorMode === "dark" ? "gray.300" : "gray.600"}
                            >
                              AI Evaluation:
                            </Text>
                            <Box
                              p={3}
                              bg={colorMode === "dark" ? "rgba(0, 0, 0, 0.2)" : "rgba(255, 255, 255, 0.5)"}
                              borderRadius="md"
                              borderWidth="1px"
                              borderColor={colorMode === "dark" ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)"}
                            >
                              <Text fontSize="md" whiteSpace="pre-wrap" color={colorMode === "dark" ? "gray.100" : "inherit"}>
                                {item.error_type}
                              </Text>
                            </Box>
                          </Box>
                        )}
                      </VStack>
                    </Box>
                  );
                })}
              </VStack>
            </Box>

            {results.failedConcepts && results.failedConcepts.length > 0 && (
              <Box>
                <Text fontWeight="bold" mb={2} fontSize="lg" color={colorMode === "dark" ? "white" : "inherit"}>
                  Concepts that need revision:
                </Text>
                <Text fontSize="md" color={colorMode === "dark" ? "gray.300" : "gray.600"}>
                  {results.failedConcepts.join(", ")}
                </Text>
              </Box>
            )}

            {aiSummary && (
              <Box>
                <Text fontWeight="bold" mb={4} fontSize="xl" color={colorMode === "dark" ? "white" : "inherit"}>
                  AI Summary & Guidance
                </Text>
                  <Box
                    p={6}
                    bg={colorMode === "dark" ? "rgba(37, 99, 235, 0.15)" : "rgba(37, 99, 235, 0.08)"}
                    borderRadius="md"
                    borderWidth="1px"
                    borderColor={colorMode === "dark" ? "rgba(37, 99, 235, 0.3)" : "rgba(37, 99, 235, 0.2)"}
                  >
                  <Box lineHeight="1.8" fontSize="lg">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkBreaks]}
                      components={markdownComponents}
                    >
                      {aiSummary}
                    </ReactMarkdown>
                  </Box>
                </Box>
              </Box>
            )}

            {loadingSummary && (
              <Box textAlign="center" py={4}>
                <Spinner size="lg" />
              <Text mt={2} fontSize="md" color={colorMode === "dark" ? "gray.300" : "gray.600"}>
                    Getting AI summary and guidance...
                  </Text>
              </Box>
            )}
          </VStack>
        </DialogBody>
        <DialogFooter>
          <HStack gap={2}>
            {aiSummary && (
              <Button
                colorScheme="blue"
                onClick={handleReadyForRevisionClick}
                size="lg"
              >
                Ready for Revision
              </Button>
            )}
            {loadingSummary && (
              <Button isDisabled size="lg">
                Loading Summary...
              </Button>
            )}
            <Button onClick={onClose} size="lg">
              Close
            </Button>
          </HStack>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}

