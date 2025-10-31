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
  renameCourse: (id: string, newTitle: string) => Promise<void>;
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
  renameCourse,
  getActiveCourse,
  isHomePage = false,
}: UseChatProps) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [saveAsLongTerm, setSaveAsLongTerm] = useState(false);
  const [enableWebSearch, setEnableWebSearch] = useState<boolean>(false);
  const router = useRouter();

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent, isLongTerm = false) => {
    e.preventDefault();
    const userMessage = input;
    setInput("");

    // Check if we have an active course, or create a new one
    let courseId = activeCourseId;
    if (!courseId) {
      courseId = (await createNewCourse()) as string;
      if (!courseId) {
        console.error("Failed to create a new course");
        return;
      }
    }

    // Add user message to course immediately
    setCourses((prev) =>
      prev.map((course) => {
        if (course.id === courseId) {
          return {
            ...course,
            history: [...course.history, { user: userMessage, ai: "" }],
          };
        }
        return course;
      })
    );

    setLoading(true);

    try {
      const res = await apiFetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          message: userMessage,
          courseId: courseId,
          userId: user?.id,
          isLongTerm: isLongTerm,
          enableWebSearch: enableWebSearch,
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

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process character by character
        while (buffer.length > 0) {
          const char = buffer[0];
          buffer = buffer.slice(1);

          // Check if we're at the start of a new SSE event
          if (char === "d" && buffer.startsWith("ata: ")) {
            // Skip past "data: " (5 characters)
            buffer = buffer.slice(5);
            const endIndex = buffer.indexOf("\n\n");
            if (endIndex === -1) continue;

            const jsonStr = buffer.slice(0, endIndex);
            buffer = buffer.slice(endIndex + 2);

            try {
              const data = JSON.parse(jsonStr);
              aiResponse += data.text;

              // Update streaming response
              updateStreamingResponse(courseId, aiResponse);
            } catch (e) {
              console.error("JSON parse error:", e);
            }
          }
        }
      }

      // Ensure the final response is properly stored in the course history
      if (aiResponse) {
        // Final update to make sure the complete response is saved
        setCourses((prev) =>
          prev.map((course) => {
            if (course.id === courseId && course.history.length > 0) {
              const updatedHistory = [...course.history];
              const lastIndex = updatedHistory.length - 1;

              updatedHistory[lastIndex] = {
                user: updatedHistory[lastIndex].user,
                ai: aiResponse,
              };

              return { ...course, history: updatedHistory };
            }
            return course;
          })
        );

        // After successful completion, if this is the first message, update the course title
        const activeCourse = getActiveCourse();
        if (activeCourse.history.length === 1) {
          const newTitle =
            userMessage.substring(0, 30) +
            (userMessage.length > 30 ? "..." : "");
          await renameCourse(courseId, newTitle);
        }
      }
    } catch (e) {
      console.error("Chat API or stream error:", e);

      // Show an error message in the UI by updating the current course
      setCourses((prev) =>
        prev.map((course) => {
          if (course.id === courseId && course.history.length > 0) {
            const updatedHistory = [...course.history];
            const lastIndex = updatedHistory.length - 1;

            updatedHistory[lastIndex] = {
              user: updatedHistory[lastIndex].user,
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
    saveAsLongTerm,
    setSaveAsLongTerm,
    enableWebSearch,
    setEnableWebSearch,
    handleSubmit,
    handleLogout,
    handleLogin,
  };
}
