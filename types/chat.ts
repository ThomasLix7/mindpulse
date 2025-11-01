export interface Course {
  id: string;
  title: string;
  history: Array<{
    user: string;
    ai: string;
    isLongterm?: boolean;
  }>;
}

export interface ChatProps {
  courseId?: string;
  learningPathId?: string;
  isHomePage?: boolean;
}

export interface Message {
  user: string;
  ai: string;
  isLongterm?: boolean;
}
