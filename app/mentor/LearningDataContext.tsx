"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { getCurrentUser } from "@/utils/supabase-client";
import { apiFetch } from "@/utils/api-fetch";

interface LearningDataContextType {
  learningPaths: any[];
  courses: any[];
  isLoading: boolean;
  refreshData: () => Promise<void>;
}

const LearningDataContext = createContext<LearningDataContextType | undefined>(
  undefined
);

export function LearningDataProvider({ children }: { children: ReactNode }) {
  const [learningPaths, setLearningPaths] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = async () => {
    try {
      const { user } = await getCurrentUser();
      if (!user?.id) return;

      const response = await apiFetch(`/api/learning-paths?userId=${user.id}`, {
        method: "GET",
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          if (data.learningPaths) {
            setLearningPaths(data.learningPaths);
          }
          if (data.courses) {
            setCourses(data.courses);
          }
        }
      }
    } catch (error) {
      console.error("Error loading learning paths:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    const handleNewLearningPath = (event: any) => {
      setLearningPaths((prev) => {
        if (prev.some((path: any) => path.id === event.detail.id)) {
          return prev;
        }
        return [event.detail, ...prev];
      });
    };

    window.addEventListener("learning-path-created", handleNewLearningPath);
    return () => {
      window.removeEventListener(
        "learning-path-created",
        handleNewLearningPath
      );
    };
  }, []);

  return (
    <LearningDataContext.Provider
      value={{ learningPaths, courses, isLoading, refreshData: loadData }}
    >
      {children}
    </LearningDataContext.Provider>
  );
}

export function useLearningData() {
  const context = useContext(LearningDataContext);
  if (context === undefined) {
    throw new Error(
      "useLearningData must be used within a LearningDataProvider"
    );
  }
  return context;
}
