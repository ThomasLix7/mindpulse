import { useState, useEffect, useRef } from "react";
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
  const [loadedCourseIds, setLoadedCourseIds] = useState<Set<string>>(
    new Set()
  );
  const router = useRouter();
  const processedCoursesRef = useRef<Set<string>>(new Set());

  const getActiveCourse = () => {
    return (
      courses.find((course) => course.id === activeCourseId) || {
        id: "",
        title: "",
        history: [],
      }
    );
  };

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { user, error } = await getCurrentUser();
        setUser(user);
        setAuthChecked(true);
      } catch (error) {
        console.error("Error initializing chat component:", error);
        setAuthChecked(true);
      }
    };

    checkAuth();
  }, []);

  useEffect(() => {
    if (!user?.id || !authChecked) return;

    if (!courseId || courseId === "new") {
      setHistoryLoading(false);
      return;
    }

    if (
      processedCoursesRef.current.has(courseId) &&
      activeCourseId === courseId
    ) {
      return;
    }

    const existingCourse = courses.find((c) => c.id === courseId);

    if (loadedCourseIds.has(courseId)) {
      if (existingCourse) {
        if (activeCourseId !== courseId) {
          setActiveCourseId(courseId);
        }
        if (historyLoading) {
          setHistoryLoading(false);
        }
        processedCoursesRef.current.add(courseId);
        return;
      }
    }

    if (existingCourse && existingCourse.history !== undefined) {
      if (activeCourseId !== courseId) {
        setActiveCourseId(courseId);
      }
      if (historyLoading) {
        setHistoryLoading(false);
      }
      if (!loadedCourseIds.has(courseId)) {
        setLoadedCourseIds((prev) => new Set(prev).add(courseId));
      }
      processedCoursesRef.current.add(courseId);
      return;
    }

    if (!loadedCourseIds.has(courseId)) {
      if (!historyLoading) {
        setHistoryLoading(true);
      }
      if (activeCourseId !== courseId) {
        setActiveCourseId(courseId);
      }
      sessionStorage.removeItem(`checked-empty-${courseId}`);
      setLoadedCourseIds((prev) => new Set(prev).add(courseId));

      loadSpecificCourse(courseId, user?.id)
        .then(() => setHistoryLoading(false))
        .catch(() => setHistoryLoading(false));
    }
  }, [
    courseId,
    user?.id,
    authChecked,
    loadedCourseIds,
    activeCourseId,
    historyLoading,
  ]);

  const loadCourses = async (userId?: string) => {
    setHistoryLoading(true);

    try {
      if (userId) {
        await fetchCoursesFromServer(userId);
      }
    } catch (error) {
      console.error("Error loading courses:", error);
    } finally {
      setHistoryLoading(false);
    }
  };

  const fetchCoursesFromServer = async (userId: string) => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;

      if (!accessToken) {
        throw new Error("No access token available");
      }

      const response = await apiFetch(`/api/courses?userId=${userId}`, {
        method: "GET",
      });

      if (response.ok) {
        const data = await response.json();

        if (data.success && data.courses && Array.isArray(data.courses)) {
          const clientCourses = data.courses.map((course: any) => ({
            id: course.id,
            title: course.title,
            history: [],
          }));

          setCourses(clientCourses);

          if (
            courseId &&
            clientCourses.some((c: Course) => c.id === courseId)
          ) {
          } else if (clientCourses.length > 0) {
            setActiveCourseId(clientCourses[0].id);
          }
        }
      }
    } catch (error) {
      console.error("Error fetching courses:", error);
    }
  };

  const createNewCourse = async () => {
    if (historyLoading || !user?.id) return null;

    const defaultTitle = "New Course";

    try {
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
          router.push(`/mentor/${data.course.id}`);

          return data.course.id;
        }
      }
    } catch (error) {
      console.error("Error creating course:", error);
    }

    return null;
  };

  const deleteCourse = async (id: string) => {
    setCourses((prev) => prev.filter((course) => course.id !== id));

    if (id === activeCourseId) {
      if (courses.length > 1) {
        const remainingCourses = courses.filter((course) => course.id !== id);
        setActiveCourseId(remainingCourses[0].id);
      } else {
        createNewCourse();
      }
    }

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

  const switchCourse = (id: string) => {
    setActiveCourseId(id);
    if (!isHomePage) {
      router.push(`/mentor/${id}`);
    }
  };

  const updateCourseHistory = (
    id: string,
    userMessage: string,
    aiResponse: string
  ) => {
    setCourses((prev) =>
      prev.map((course) => {
        if (course.id === id) {
          let updatedTitle = course.title;
          if (course.history.length === 0 && userMessage.length > 0) {
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

  const checkCourseExists = (id: string) => {
    return courses.some((course) => course.id === id);
  };

  useEffect(() => {
    if (historyLoading || !authChecked || !user?.id) {
      return;
    }

    if (activeCourseId && activeCourseId !== "new") {
      const checkedEmptyKey = `checked-empty-${activeCourseId}`;
      if (sessionStorage.getItem(checkedEmptyKey)) {
        return;
      }

      const exists = checkCourseExists(activeCourseId);
      const existingCourse = courses.find((c) => c.id === activeCourseId);

      if (
        (!exists || (existingCourse && existingCourse.history === undefined)) &&
        !loadedCourseIds.has(activeCourseId)
      ) {
        loadSpecificCourse(activeCourseId, user?.id);
        return;
      }
    }
  }, [
    historyLoading,
    authChecked,
    activeCourseId,
    user?.id,
    courses,
    loadedCourseIds,
  ]);

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
            data.course.history = data.course.history || [];

            const formattedHistory = data.course.history.map((item: any) => {
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
    deleteCourse,
    switchCourse,
    updateCourseHistory,
    updateStreamingResponse,
    loadSpecificCourse,
  };
}
