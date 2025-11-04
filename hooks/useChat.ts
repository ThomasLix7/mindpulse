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
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        // Process SSE format: look for "data: " lines
        let dataIndex = buffer.indexOf("data: ");
        while (dataIndex !== -1) {
          // Extract everything after "data: "
          const afterData = buffer.slice(dataIndex + 6);
          const endIndex = afterData.indexOf("\n\n");

          if (endIndex === -1) {
            // Need more data, keep the buffer from "data: " onwards
            buffer = buffer.slice(dataIndex);
            break;
          }

          const jsonStr = afterData.slice(0, endIndex).trim();
          buffer = buffer.slice(dataIndex + 6 + endIndex + 2);

          try {
            const data = JSON.parse(jsonStr);
            if (data.text) {
              pendingChars += data.text;

              // Batch updates: flush every 15 characters or after 100ms for smoother streaming
              if (pendingChars.length >= 15) {
                flushPending();
              } else if (!updateTimer) {
                updateTimer = setTimeout(flushPending, 100);
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

      // Show an error message in the UI by updating the current course
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
    // Reset to a new anonymous session
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
