export interface Conversation {
  id: string;
  title: string;
  history: Array<{
    user: string;
    ai: string;
    isLongterm?: boolean;
  }>;
}

export interface ChatProps {
  conversationId?: string;
  isHomePage?: boolean;
}

export interface Message {
  user: string;
  ai: string;
  isLongterm?: boolean;
}
