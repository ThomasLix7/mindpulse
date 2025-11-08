import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "@/utils/supabase-client";
import { apiFetch } from "@/utils/api-fetch";

interface UseChatProps {
  courses: any[];
  setCourses: React.Dispatch<React.SetStateAction<any[]>>;
  activeCourseId: string;
  user: any;
  createNewCourse: () => Promise<string | null>;
  updateCourseHistory: (
    id: string,
    userMessage: string,
    aiResponse: string
  ) => void;
  updateStreamingResponse: (id: string, aiResponse: string) => void;
  getActiveCourse: () => any;
  isHomePage?: boolean;
}

export function useChat({
  courses,
  setCourses,
  activeCourseId,
  user,
  createNewCourse,
  updateCourseHistory,
  updateStreamingResponse,
  getActiveCourse,
  isHomePage = false,
}: UseChatProps) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [enableWebSearch, setEnableWebSearch] = useState<boolean>(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent, message?: string) => {
    e.preventDefault();
    const userMessage = message || input.trim();

    if (!userMessage) {
      setLoading(false);
      return;
    }

    setInput("");

    let courseId = activeCourseId;
    if (!courseId) {
      courseId = (await createNewCourse()) as string;
      if (!courseId) {
        console.error("Failed to create a new course");
        return;
      }
    }

    if (!user?.id) {
      console.error("User ID is missing");
      return;
    }

    // Don't add special messages (like assessment results) to history
    const isSpecialMessage =
      userMessage === "__GREETING__" ||
      userMessage === "__CONTINUE__" ||
      userMessage.startsWith("__ASSESSMENT_RESULT__:");

    if (!isSpecialMessage) {
      setCourses((prev) =>
        prev.map((course) =>
          course.id === courseId
            ? {
                ...course,
                history: [...course.history, { user: userMessage, ai: "" }],
              }
            : course
        )
      );
    } else {
      // For special messages, add an empty AI response entry so streaming works
      setCourses((prev) =>
        prev.map((course) =>
          course.id === courseId
            ? {
                ...course,
                history: [...course.history, { user: "", ai: "" }],
              }
            : course
        )
      );
    }

    setLoading(true);

    try {
      const res = await apiFetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          message: userMessage,
          courseId,
          userId: user.id,
          enableWebSearch,
        }),
      });

      if (!res.ok) {
        throw new Error(`API responded with status: ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error("Response body reader could not be created");
      }

      const decoder = new TextDecoder();
      let aiResponse = "";
      let buffer = "";
      let pendingChars = "";
      let updateTimer: ReturnType<typeof setTimeout> | null = null;

      const flushPending = () => {
        if (pendingChars) {
          aiResponse += pendingChars;
          updateStreamingResponse(courseId, aiResponse);
          pendingChars = "";
        }
        if (updateTimer) {
          clearTimeout(updateTimer);
          updateTimer = null;
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          flushPending();
          // For special messages, save the final response to history (without user message)
          if (isSpecialMessage && aiResponse) {
            updateCourseHistory(courseId, "", aiResponse);
          }
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        let dataIndex = buffer.indexOf("data: ");
        while (dataIndex !== -1) {
          const afterData = buffer.slice(dataIndex + 6);
          const endIndex = afterData.indexOf("\n\n");

          if (endIndex === -1) {
            buffer = buffer.slice(dataIndex);
            break;
          }

          const jsonStr = afterData.slice(0, endIndex).trim();
          buffer = buffer.slice(dataIndex + 6 + endIndex + 2);

          try {
            const data = JSON.parse(jsonStr);
            if (data.text) {
              pendingChars += data.text;

              if (pendingChars.length >= 15) {
                flushPending();
              } else if (!updateTimer) {
                updateTimer = setTimeout(flushPending, 100);
              }
            }

            // Handle assessment ready signal (user needs to confirm)
            if (data.type === "assessment_ready_signal") {
              if (window.dispatchEvent) {
                window.dispatchEvent(
                  new CustomEvent("assessmentReadySignal", {
                    detail: {
                      topic: data.topic,
                    },
                  })
                );
              }
            }

            // Handle assessment ready event (after generation)
            if (data.type === "assessment_ready" && data.assessmentId) {
              if (window.dispatchEvent) {
                window.dispatchEvent(
                  new CustomEvent("assessmentReady", {
                    detail: {
                      assessmentId: data.assessmentId,
                      topic: data.topic,
                    },
                  })
                );
              }
            }
          } catch (e) {
            console.error("JSON parse error:", e);
          }

          dataIndex = buffer.indexOf("data: ");
        }
      }
    } catch (e) {
      console.error("Chat API or stream error:", e);

      setCourses((prev) =>
        prev.map((course) => {
          if (course.id === courseId && course.history.length > 0) {
            const updatedHistory = [...course.history];
            updatedHistory[updatedHistory.length - 1] = {
              ...updatedHistory[updatedHistory.length - 1],
              ai: "Sorry, there was an error processing your request. Please try again.",
            };
            return { ...course, history: updatedHistory };
          }
          return course;
        })
      );
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    createNewCourse();
    router.push("/login");
  };

  const handleLogin = () => {
    router.push("/login");
  };

  return {
    input,
    setInput,
    loading,
    enableWebSearch,
    setEnableWebSearch,
    handleSubmit,
    handleLogout,
    handleLogin,
  };
}
