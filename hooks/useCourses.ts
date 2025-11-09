import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser, supabase } from "@/utils/supabase-client";
import { apiFetch } from "@/utils/api-fetch";
import { Course } from "@/types/chat";
import { useLearningData } from "@/app/mentor/LearningDataContext";

function isLongtermMemory(item: any): boolean {
  return Boolean(
    item.is_longterm === true ||
      item.metadata?.isLongterm === true ||
      item.isLongterm === true
  );
}

export function useCourses(courseId?: string, isHomePage?: boolean) {
  const { courses: contextCourses } = useLearningData();
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
  const loadingCoursesRef = useRef<Set<string>>(new Set());
  const loadingHistoryRef = useRef<Set<string>>(new Set());

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
    if (contextCourses && contextCourses.length > 0) {
      const clientCourses = contextCourses.map((course: any) => ({
        id: course.id,
        title: course.title,
        curriculum: course.curriculum,
        learning_path_id: course.learning_path_id,
        course_order: course.course_order,
        current_lesson_index: course.current_lesson_index,
        current_topic_index: course.current_topic_index,
        metadata: course.metadata,
        history: [],
      }));
      setCourses(clientCourses);

      if (courseId && clientCourses.some((c: Course) => c.id === courseId)) {
      } else if (clientCourses.length > 0 && !activeCourseId) {
        setActiveCourseId(clientCourses[0].id);
      }
    }
  }, [contextCourses, courseId, activeCourseId]);

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
    if (!user?.id || !authChecked) {
      return;
    }

    if (!courseId || courseId === "new") {
      setHistoryLoading(false);
      return;
    }

    if (
      processedCoursesRef.current.has(courseId) &&
      activeCourseId === courseId &&
      loadedCourseIds.has(courseId)
    ) {
      return;
    }

    const existingCourse = courses.find((c) => c.id === courseId);

    if (loadedCourseIds.has(courseId)) {
      if (
        existingCourse &&
        existingCourse.history &&
        existingCourse.history.length > 0
      ) {
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

    if (
      existingCourse &&
      existingCourse.history &&
      existingCourse.history.length > 0
    ) {
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

    // Course exists but no history yet, or doesn't exist - fetch it
    if (
      !loadingCoursesRef.current.has(courseId) &&
      !loadingHistoryRef.current.has(courseId)
    ) {
      loadingHistoryRef.current.add(courseId);
      loadingCoursesRef.current.add(courseId);
      setHistoryLoading(true);
      setActiveCourseId(courseId);
      sessionStorage.removeItem(`checked-empty-${courseId}`);

      loadSpecificCourse(courseId, user?.id)
        .then((result) => {
          setHistoryLoading(false);
          loadingCoursesRef.current.delete(courseId);
          loadingHistoryRef.current.delete(courseId);
          setLoadedCourseIds((prev) => new Set(prev).add(courseId));
          processedCoursesRef.current.add(courseId);
        })
        .catch((error) => {
          console.error(`[useCourses] loadSpecificCourse failed:`, error);
          setHistoryLoading(false);
          loadingCoursesRef.current.delete(courseId);
          loadingHistoryRef.current.delete(courseId);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, user?.id, authChecked]);

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

          window.dispatchEvent(
            new CustomEvent("course-created", {
              detail: newCourse,
            })
          );

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

      if (
        loadedCourseIds.has(activeCourseId) ||
        loadingCoursesRef.current.has(activeCourseId) ||
        loadingHistoryRef.current.has(activeCourseId)
      ) {
        return;
      }

      const exists = checkCourseExists(activeCourseId);
      const existingCourse = courses.find((c) => c.id === activeCourseId);

      if (!exists || (existingCourse && existingCourse.history === undefined)) {
        loadingHistoryRef.current.add(activeCourseId);
        loadingCoursesRef.current.add(activeCourseId);
        loadSpecificCourse(activeCourseId, user?.id)
          .then(() => {
            loadingCoursesRef.current.delete(activeCourseId);
            loadingHistoryRef.current.delete(activeCourseId);
          })
          .catch(() => {
            loadingCoursesRef.current.delete(activeCourseId);
            loadingHistoryRef.current.delete(activeCourseId);
          });
      }
    }
  }, [historyLoading, authChecked, activeCourseId, user?.id]);

  useEffect(() => {
    if (!historyLoading && authChecked && courses.length === 0 && !courseId) {
      createNewCourse();
    }
  }, [historyLoading, authChecked, courses.length, courseId]);

  useEffect(() => {
    if (courseId === "new" && !historyLoading && authChecked) {
      createNewCourse();
    }
  }, [courseId, historyLoading, authChecked]);

  const loadSpecificCourse = async (courseId: string, userId?: string) => {
    const checkedEmpty = sessionStorage.getItem(`checked-empty-${courseId}`);
    if (checkedEmpty) {
      setHistoryLoading(false);
      return null;
    }

    const existingCourse = courses.find((c) => c.id === courseId);
    if (
      existingCourse &&
      existingCourse.history &&
      existingCourse.history.length > 0
    ) {
      return existingCourse;
    }

    setHistoryLoading(true);

    try {
      const existingCourse = courses.find((c) => c.id === courseId);

      if (existingCourse) {
        if (
          (!existingCourse.history || existingCourse.history.length === 0) &&
          user?.id
        ) {
          // Check server for history
        } else {
          console.log(`[loadSpecificCourse] Course has history, returning`);
          setHistoryLoading(false);
          return existingCourse;
        }
      }

      if (user?.id) {
        try {
          console.log(
            `[loadSpecificCourse] Fetching from API: /api/courses?userId=${user.id}&courseId=${courseId}`
          );

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
                user: item.userMessage || item.user || "",
                ai: item.aiResponse || item.ai || "",
                isLongterm: itemIsLongterm,
                timestamp: item.timestamp || Date.now(),
              };
            });

            const formattedCourse = {
              id: data.course.id,
              title: data.course.title || "New Course",
              created_at: data.course.created_at,
              updated_at: data.course.updated_at,
              history: formattedHistory,
            } as any;

            setCourses((prevCourses) => {
              const filtered = prevCourses.filter((c) => c.id !== courseId);
              return [...filtered, formattedCourse];
            });

            setHistoryLoading(false);

            if (
              !formattedCourse.history ||
              formattedCourse.history.length === 0
            ) {
              sessionStorage.setItem(`checked-empty-${courseId}`, "true");
            }

            return formattedCourse;
          } else {
            loadingCoursesRef.current.delete(courseId);
            sessionStorage.setItem(`checked-empty-${courseId}`, "true");
          }
        } catch (error) {
          console.error("Error fetching course from server:", error);
          loadingCoursesRef.current.delete(courseId);
        }
      }

      loadingCoursesRef.current.delete(courseId);
      setHistoryLoading(false);
      sessionStorage.setItem(`checked-empty-${courseId}`, "true");
      return null;
    } catch (error) {
      loadingCoursesRef.current.delete(courseId);
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
