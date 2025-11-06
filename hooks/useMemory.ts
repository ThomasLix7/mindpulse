import { useState } from "react";
import { apiFetch } from "@/utils/api-fetch";
import { Course } from "@/types/chat";

function isLongtermMemory(item: any): boolean {
  return Boolean(
    item.is_longterm === true ||
      item.metadata?.isLongterm === true ||
      item.isLongterm === true
  );
}

interface UseMemoryProps {
  courses: Course[];
  setCourses: React.Dispatch<React.SetStateAction<Course[]>>;
  user: any;
}

export function useMemory({
  courses,
  setCourses,
  user,
}: UseMemoryProps) {
  const [savingToLongTerm, setSavingToLongTerm] = useState<number | null>(null);

  // Forget from long-term memory
  const forgetFromLongTermMemory = async (
    courseId: string,
    messageIndex: number
  ) => {
    if (!user?.id) {
      alert("You must be logged in to manage long-term memory");
      return;
    }

    const course = courses.find((c) => c.id === courseId);
    if (!course || messageIndex >= course.history.length) {
      console.error("Course or message not found");
      return;
    }

    const message = course.history[messageIndex];

    // Set the saving indicator
    setSavingToLongTerm(messageIndex);

    try {
      // Get the memory ID for this message
      const findMemoryResponse = await apiFetch("/api/memory", {
        method: "PUT",
        body: JSON.stringify({
          courseId: courseId,
          userMessage: message.user,
          userId: user.id,
        }),
      });

      if (!findMemoryResponse.ok) {
        const errorData = await findMemoryResponse.json();

        if (findMemoryResponse.status === 404) {
          alert(
            "Could not find this message in the database. It may not have been properly saved."
          );
        } else {
          alert(`Could not find memory: ${errorData.error || "Unknown error"}`);
        }
        return;
      }

      const findData = await findMemoryResponse.json();

      if (!findData.memoryId) {
        alert("Could not find the memory for this message");
        return;
      }

      // Use URL parameters for DELETE (not body)
      const deleteUrl = `/api/memory?userId=${encodeURIComponent(
        user.id
      )}&memoryId=${encodeURIComponent(findData.memoryId)}`;

      const response = await apiFetch(deleteUrl, {
        method: "DELETE",
      });

      // Handle response
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          // Only show alert if not an active course to avoid disrupting the chat flow
          const isActiveCourse = courses.some(
            (c) => c.id === courseId
          );
          if (!isActiveCourse) {
            alert("Successfully removed from long-term memory!");
          }

          // Update local state to reflect the change
          setCourses((prev) =>
            prev.map((course) => {
              if (course.id === courseId) {
                const updatedHistory = [...course.history];
                updatedHistory[messageIndex] = {
                  ...updatedHistory[messageIndex],
                  isLongterm: false,
                };

                return { ...course, history: updatedHistory };
              }
              return course;
            })
          );
        } else {
          alert(
            `Failed to remove: ${data.error || "Unknown error"}${
              data.details ? ` - ${data.details}` : ""
            }`
          );
        }
      } else {
        try {
          const errorData = await response.json();
          alert(
            `Failed to remove: ${errorData.error || "Unknown error"}${
              errorData.details ? ` - ${errorData.details}` : ""
            }`
          );
        } catch (jsonError) {
          alert(
            `Failed to remove from long-term memory: Error status ${response.status}`
          );
        }
      }
    } catch (error) {
      alert(
        `Failed to remove from long-term memory: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    } finally {
      setSavingToLongTerm(null);
    }
  };

  // Save to long-term memory
  const saveToLongTermMemory = async (
    courseId: string,
    messageIndex: number
  ) => {
    if (!user?.id) {
      alert("You must be logged in to save to long-term memory");
      return;
    }

    const course = courses.find((c) => c.id === courseId);
    if (!course || messageIndex >= course.history.length) {
      console.error("Course or message not found");
      return;
    }

    const message = course.history[messageIndex];

    // Set the saving indicator
    setSavingToLongTerm(messageIndex);

    try {
      // Get the memory ID for this message
      const findMemoryResponse = await apiFetch("/api/memory", {
        method: "PUT",
        body: JSON.stringify({
          courseId: courseId,
          userMessage: message.user,
          userId: user.id,
        }),
      });

      if (!findMemoryResponse.ok) {
        const errorData = await findMemoryResponse.json();

        if (findMemoryResponse.status === 404) {
          alert(
            "Could not find this message in the database. It may not have been properly saved."
          );
        } else {
          alert(`Could not find memory: ${errorData.error || "Unknown error"}`);
        }
        return;
      }

      const findData = await findMemoryResponse.json();

      if (!findData.memoryId) {
        alert("Could not find the memory for this message");
        return;
      }

      // Use the memory endpoint to promote it
      const response = await apiFetch("/api/memory", {
        method: "POST",
        body: JSON.stringify({
          memoryId: findData.memoryId,
          userId: user.id,
        }),
      });

      // Handle response
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          const isActiveCourse = courses.some(
            (c) => c.id === courseId
          );
          if (!isActiveCourse) {
            alert("Successfully saved to long-term memory!");
          }

          setCourses((prev) =>
            prev.map((course) => {
              if (course.id === courseId) {
                const updatedHistory = [...course.history];
                updatedHistory[messageIndex] = {
                  ...updatedHistory[messageIndex],
                  isLongterm: true,
                };

                return { ...course, history: updatedHistory };
              }
              return course;
            })
          );
        } else {
          alert(
            `Failed to save: ${data.error || "Unknown error"}${
              data.details ? ` - ${data.details}` : ""
            }`
          );
        }
        } else {
          try {
            const errorData = await response.json();
            if (errorData && Object.keys(errorData).length > 0) {
            alert(
              `Failed to save: ${errorData.error || "Unknown error"}${
                errorData.details ? ` - ${errorData.details}` : ""
              }`
            );
          } else {
            alert(
              `Failed to save to long-term memory: Empty error response (status ${response.status})`
            );
          }
        } catch (jsonError) {
          alert(
            `Failed to save to long-term memory: Error status ${response.status}`
          );
        }
      }
    } catch (error) {
      alert(
        `Failed to save to long-term memory: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    } finally {
      setSavingToLongTerm(null);
    }
  };

  return {
    savingToLongTerm,
    forgetFromLongTermMemory,
    saveToLongTermMemory,
    isLongtermMemory,
  };
}
