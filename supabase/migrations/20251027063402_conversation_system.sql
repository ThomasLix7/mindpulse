-- Conversation System
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,
  conversation_type TEXT DEFAULT 'learning', -- 'learning', 'assessment', 'reflection'
  status TEXT DEFAULT 'active', -- 'active', 'paused', 'completed', 'archived'
  metadata JSONB, -- Additional conversation data
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL, -- 'user', 'assistant', 'system'
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'text', -- 'text', 'hint', 'question', 'explanation'
  metadata JSONB, -- Additional message data
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE feedback_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'hint_requested', 'explanation_needed', 'difficulty_adjustment'
  feedback_content TEXT,
  user_response TEXT,
  effectiveness_rating INTEGER, -- 1-10 scale
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversation_messages_conversation_id ON conversation_messages(conversation_id);
CREATE INDEX idx_feedback_events_user_id ON feedback_events(user_id);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access their own conversations" ON conversations FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can access their own conversation messages" ON conversation_messages FOR ALL USING (auth.uid() = (SELECT user_id FROM conversations WHERE id = conversation_id));
CREATE POLICY "Users can access their own feedback events" ON feedback_events FOR ALL USING (auth.uid() = user_id);
