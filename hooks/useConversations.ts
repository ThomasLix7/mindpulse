import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser, supabase } from "@/utils/supabase-client";
import { apiFetch } from "@/utils/api-fetch";
import { Course } from "@/types/chat";

function generateCourseId(): string {
  return `course-${Math.random().toString(36).substring(2, 15)}-${Date.now()}`;
}

function isLongtermMemory(item: any): boolean {
  return Boolean(
    item.is_longterm === true ||
      item.metadata?.isLongterm === true ||
      item.isLongterm === true
  );
}

export function useCourses(courseId?: string, isHomePage?: boolean) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [activeCourseId, setActiveCourseId] = useState<string>(courseId || "");
  const [historyLoading, setHistoryLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const router = useRouter();

  // Get active course
  const getActiveCourse = () => {
    return (
      courses.find((course) => course.id === activeCourseId) || {
        id: "",
        title: "",
        history: [],
      }
    );
  };

  // Initialize user and conversations
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { user, error } = await getCurrentUser();
        setUser(user);
        setAuthChecked(true);

        // Load courses from localStorage or server
        if (courseId === "new" || !courseId) {
          setHistoryLoading(false);
          return;
        }

        // Load specific course if provided
        if (courseId && user?.id) {
          await loadSpecificCourse(courseId, user.id);
          setHistoryLoading(false);
        } else {
          // Load all courses
          await loadCourses(user?.id);
        }
      } catch (error) {
        console.error("Error initializing chat component:", error);
        setAuthChecked(true);
        setHistoryLoading(false);
      }
    };

    checkAuth();
  }, [courseId]);

  // Watch for courseId changes
  useEffect(() => {
    if (!user?.id || !authChecked) return;

    // Clear loading state
    setHistoryLoading(true);

    if (courseId && courseId !== "new") {
      // Set as active course
      setActiveCourseId(courseId);
      // Reset previous state
      sessionStorage.removeItem(`checked-empty-${courseId}`);
      // Load course
      loadSpecificCourse(courseId, user?.id)
        .then(() => setHistoryLoading(false))
        .catch(() => setHistoryLoading(false));
    }
  }, [courseId, user?.id, authChecked]);

  // Load courses from localStorage or server
  const loadCourses = async (userId?: string) => {
    setHistoryLoading(true);

    try {
      if (userId) {
        // Fetch from server
        await fetchCoursesFromServer(userId);
      }
    } catch (error) {
      console.error("Error loading courses:", error);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Fetch courses from server
  const fetchCoursesFromServer = async (userId: string) => {
    try {
      // Get user's access token
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;

      if (!accessToken) {
        throw new Error("No access token available");
      }

      // Get course list without history
      const response = await apiFetch(`/api/courses?userId=${userId}`, {
        method: "GET",
      });

      if (response.ok) {
        const data = await response.json();

        if (data.success && data.courses && Array.isArray(data.courses)) {
          // Map server data to client format
          const clientCourses = data.courses.map((course: any) => ({
            id: course.id,
            title: course.title,
            history: [], // Empty history, loaded when needed
          }));

          setCourses(clientCourses);

          // Prioritize courseId from URL
          if (
            courseId &&
            clientCourses.some((c: Course) => c.id === courseId)
          ) {
            // Already set in initial state
          }
          // Set most recent course
          else if (clientCourses.length > 0) {
            setActiveCourseId(clientCourses[0].id);
          }
          // Don't create new course here - let the component handle it
        }
        // Don't create new course here - let the component handle it
      }
      // Don't create new course here - let the component handle it
    } catch (error) {
      console.error("Error fetching courses:", error);
      // Don't create new course here - let the component handle it
    }
  };

  // Create new course
  const createNewCourse = async () => {
    // Prevent multiple simultaneous creations
    if (historyLoading || !user?.id) return null;

    const defaultTitle = "New Course";

    try {
      // Get user's access token
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;

      if (!accessToken) {
        throw new Error("No access token available");
      }

      const serverResponse = await apiFetch("/api/courses", {
        method: "POST",
        body: JSON.stringify({
          userId: user.id,
          title: defaultTitle,
          learningPathId: "", // TODO: This should come from context
        }),
      });

      if (serverResponse.ok) {
        const data = await serverResponse.json();
        if (data.success && data.course) {
          const newCourse = {
            id: data.course.id,
            title: data.course.title,
            history: [],
          };

          setCourses((prev) => [newCourse, ...prev]);

          // Notify sidebar of new course
          window.dispatchEvent(
            new CustomEvent("course-created", {
              detail: newCourse,
            })
          );

          // Navigate to course
          router.push(`/chat/${data.course.id}`);

          return data.course.id;
        }
      }
    } catch (error) {
      console.error("Error creating course:", error);
    }

    return null;
  };

  // Rename course
  const renameCourse = async (id: string, newTitle: string) => {
    // Update locally first
    setCourses((prev) =>
      prev.map((course) =>
        course.id === id ? { ...course, title: newTitle } : course
      )
    );

    // Update on server for logged-in users
    if (user?.id) {
      try {
        await apiFetch("/api/courses", {
          method: "PUT",
          body: JSON.stringify({
            id,
            title: newTitle,
            userId: user.id,
          }),
        });
      } catch (error) {
        console.error("Error updating course title on server:", error);
      }
    }
  };

  // Delete course
  const deleteCourse = async (id: string) => {
    // Remove course from list
    setCourses((prev) => prev.filter((course) => course.id !== id));

    // Switch to another course if deleting active one
    if (id === activeCourseId) {
      if (courses.length > 1) {
        // Find next course
        const remainingCourses = courses.filter((course) => course.id !== id);
        setActiveCourseId(remainingCourses[0].id);
      } else {
        createNewCourse();
      }
    }

    // Delete on server for logged-in users
    if (user?.id) {
      try {
        await apiFetch(`/api/courses?id=${id}&userId=${user.id}`, {
          method: "DELETE",
        });
      } catch (error) {
        console.error("Error deleting course on server:", error);
      }
    }
  };

  // Switch course
  const switchCourse = (id: string) => {
    setActiveCourseId(id);
    // Navigate to course page
    if (!isHomePage) {
      router.push(`/chat/${id}`);
    }
  };

  // Update course history
  const updateCourseHistory = (
    id: string,
    userMessage: string,
    aiResponse: string
  ) => {
    setCourses((prev) =>
      prev.map((course) => {
        if (course.id === id) {
          // Update course title based on first message if it's default
          let updatedTitle = course.title;
          if (course.history.length === 0 && userMessage.length > 0) {
            // Use first 30 chars of user message as title
            updatedTitle =
              userMessage.substring(0, 30) +
              (userMessage.length > 30 ? "..." : "");
          }

          return {
            ...course,
            title: updatedTitle,
            history: [...course.history, { user: userMessage, ai: aiResponse }],
          };
        }
        return course;
      })
    );
  };

  // Update course history with streaming AI response
  const updateStreamingResponse = (id: string, aiResponse: string) => {
    setCourses((prev) =>
      prev.map((course) => {
        if (course.id === id && course.history.length > 0) {
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
  };

  // Clear course
  const clearCourse = async () => {
    // Clear only the active course in the UI
    setCourses((prev) =>
      prev.map((course) =>
        course.id === activeCourseId ? { ...course, history: [] } : course
      )
    );

    // For logged-in users, clear history in the database
    if (user?.id) {
      try {
        await fetch(`/api/courses/clear`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            courseId: activeCourseId,
            userId: user.id,
          }),
        });
      } catch (error) {
        console.error("Error clearing course history on server:", error);
      }
    }
  };

  // Check if the course from URL exists in our loaded courses
  const checkCourseExists = (id: string) => {
    return courses.some((course) => course.id === id);
  };

  // Safety check to ensure the current course is loaded with all its memories
  useEffect(() => {
    // Skip if we're still loading or not authenticated yet
    if (historyLoading || !authChecked) {
      return;
    }

    // Only attempt to load if we have an active course ID and it's not "new"
    if (activeCourseId && activeCourseId !== "new") {
      // Check if we've already confirmed this course is empty
      const checkedEmptyKey = `checked-empty-${activeCourseId}`;
      if (sessionStorage.getItem(checkedEmptyKey)) {
        return;
      }

      const exists = checkCourseExists(activeCourseId);

      // Only load if the course doesn't exist at all in our state
      if (!exists) {
        loadSpecificCourse(activeCourseId, user?.id);
        return;
      }

      // to the loadSpecificCourse function with its empty check tracking
    }
  }, [historyLoading, authChecked, activeCourseId, user?.id]);

  // Create a new course if none exist and we're not loading
  useEffect(() => {
    if (!historyLoading && authChecked && courses.length === 0 && !courseId) {
      createNewCourse();
    }
  }, [historyLoading, authChecked, courses.length, courseId]);

  // Handle "new" course creation
  useEffect(() => {
    if (courseId === "new" && !historyLoading && authChecked) {
      createNewCourse();
    }
  }, [courseId, historyLoading, authChecked]);

  // Load specific course by ID
  const loadSpecificCourse = async (courseId: string, userId?: string) => {
    // Don't load if we already checked this course was empty (prevents infinite loops)
    const checkedEmpty = sessionStorage.getItem(`checked-empty-${courseId}`);
    if (checkedEmpty) {
      setHistoryLoading(false);
      return null;
    }

    // Set loading state
    setHistoryLoading(true);

    try {
      // First check if we already have this course in memory
      const existingCourse = courses.find((c) => c.id === courseId);

      if (existingCourse) {
        // If course exists but has no history, check if we need to load from server
        if (
          (!existingCourse.history || existingCourse.history.length === 0) &&
          user?.id
        ) {
          // Check server for history
        } else {
          // We have a valid memory course with history, use it
          setHistoryLoading(false);
          return existingCourse;
        }
      }

      // For authenticated users, fetch from server
      if (user?.id) {
        try {
          // Get user's access token
          const {
            data: { session },
          } = await supabase.auth.getSession();
          const accessToken = session?.access_token;

          if (!accessToken) {
            throw new Error("No access token available");
          }

          const response = await apiFetch(
            `/api/courses?userId=${encodeURIComponent(
              user.id
            )}&courseId=${encodeURIComponent(courseId)}`,
            {}
          );

          if (!response.ok) {
            throw new Error(`Server returned ${response.status}`);
          }

          const data = await response.json();

          if (data.course) {
            // Ensure history is always an array
            data.course.history = data.course.history || [];

            // Convert server history format (userMessage/aiResponse) to client format (user/ai)
            const formattedHistory = data.course.history.map((item: any) => {
              // Use utility function to determine longterm status
              const itemIsLongterm = isLongtermMemory(item);

              return {
                user: item.userMessage,
                ai: item.aiResponse,
                isLongterm: itemIsLongterm,
              };
            });

            const formattedCourse = {
              id: data.course.id,
              title: data.course.title || "New Course",
              created_at: data.course.created_at,
              updated_at: data.course.updated_at,
              history: formattedHistory, // Use the converted history format
            };

            // Update courses in memory
            setCourses((prevCourses) => {
              // Avoid duplicates
              const filtered = prevCourses.filter((c) => c.id !== courseId);
              return [...filtered, formattedCourse];
            });

            setHistoryLoading(false);

            // Mark as empty if needed for future reference
            if (
              !formattedCourse.history ||
              formattedCourse.history.length === 0
            ) {
              sessionStorage.setItem(`checked-empty-${courseId}`, "true");
            }

            return formattedCourse;
          } else {
            sessionStorage.setItem(`checked-empty-${courseId}`, "true");
          }
        } catch (error) {
          console.error("Error fetching course from server:", error);
        }
      }

      setHistoryLoading(false);
      sessionStorage.setItem(`checked-empty-${courseId}`, "true");
      return null;
    } catch (error) {
      setHistoryLoading(false);
      return null;
    }
  };

  return {
    courses,
    setCourses,
    activeCourseId,
    setActiveCourseId,
    historyLoading,
    user,
    authChecked,
    getActiveCourse,
    createNewCourse,
    renameCourse,
    deleteCourse,
    switchCourse,
    updateCourseHistory,
    updateStreamingResponse,
    clearCourse,
    loadSpecificCourse,
  };
}
