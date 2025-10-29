-- MVP Core System
-- Essential tables for basic learning platform

-- User Management
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id),
  username text,
  avatar_url text,
  age_range text, -- '18-25', '26-35', etc.
  education_level text, -- 'high_school', 'bachelor', 'master', 'phd'
  career_target text, -- Career goal/aspiration
  learning_preferences jsonb, -- Learning style and preferences
  preferred_languages jsonb, -- Array of language codes
  accessibility_needs jsonb, -- Accessibility requirements
  timezone text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Automatically create a profile when a new auth user is created
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

-- User Skills
CREATE TABLE user_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_name text NOT NULL,
  proficiency_level text NOT NULL, -- 'beginner', 'intermediate', 'advanced', 'expert'
  category text, -- 'technical', 'language', 'soft_skills', etc.
  last_updated timestamptz DEFAULT now()
);

-- Subject Management
CREATE TABLE domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE, -- 'STEM', 'Humanities', 'Languages', 'Arts'
  description TEXT,
  color_code TEXT, -- For UI theming
  icon TEXT, -- Icon identifier
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id UUID REFERENCES domains(id) ON DELETE CASCADE,
  name TEXT NOT NULL, -- 'Mathematics', 'Physics', 'Spanish'
  description TEXT,
  difficulty_levels JSONB, -- ['beginner', 'intermediate', 'advanced']
  learning_objectives JSONB, -- Common objectives for this subject
  prerequisites JSONB, -- Other subjects that are helpful
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Learning Goals
CREATE TABLE learning_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
  difficulty_level TEXT DEFAULT 'intermediate', -- 'beginner', 'intermediate', 'advanced'
  target_completion_date TIMESTAMP WITH TIME ZONE,
  status TEXT DEFAULT 'active', -- 'active', 'paused', 'completed', 'cancelled'
  priority INTEGER DEFAULT 3, -- 1-5 scale
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Conversations
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

-- Feedback
CREATE TABLE feedback_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  target_id UUID, -- References different tables based on target_type
  target_type TEXT NOT NULL, -- 'conversation', 'session', 'assessment', 'curriculum'
  event_type TEXT NOT NULL, -- 'hint_requested', 'explanation_needed', 'difficulty_adjustment', 'style_feedback'
  feedback_data JSONB, -- Flexible data structure for different feedback types
  effectiveness_rating INTEGER, -- 1-10 scale
  user_preference_rating INTEGER, -- 1-10 scale
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Indexes
CREATE INDEX profiles_username_idx ON public.profiles (username);
CREATE INDEX user_skills_user_id_idx ON user_skills(user_id);
CREATE INDEX user_skills_skill_name_idx ON user_skills(skill_name);
CREATE INDEX user_skills_user_skill_idx ON user_skills(user_id, skill_name);
CREATE INDEX idx_subjects_domain_id ON subjects(domain_id);
CREATE INDEX learning_goals_user_id_idx ON learning_goals(user_id);
CREATE INDEX learning_goals_status_idx ON learning_goals(status);
CREATE INDEX learning_goals_subject_id_idx ON learning_goals(subject_id);
CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversation_messages_conversation_id ON conversation_messages(conversation_id);
CREATE INDEX idx_feedback_events_user_id ON feedback_events(user_id);

-- Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "User can view own profile" ON public.profiles
FOR SELECT USING (id = auth.uid());

CREATE POLICY "User can update own profile" ON public.profiles
FOR UPDATE USING (id = auth.uid());

CREATE POLICY "User access to own skills" ON user_skills
FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Users can access domains" ON domains FOR SELECT USING (true);
CREATE POLICY "Users can access subjects" ON subjects FOR SELECT USING (true);

CREATE POLICY "User access to own learning goals" ON learning_goals
FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Users can access their own conversations" ON conversations FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can access their own conversation messages" ON conversation_messages FOR ALL USING (auth.uid() = (SELECT user_id FROM conversations WHERE id = conversation_id));
CREATE POLICY "Users can access their own feedback events" ON feedback_events FOR ALL USING (auth.uid() = user_id);

-- Trigger function for conversations
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS update_conversations_updated_at ON conversations;
CREATE TRIGGER update_conversations_updated_at
BEFORE UPDATE ON conversations
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Profile view with email (read-only convenience)
CREATE OR REPLACE VIEW profile_with_email AS
SELECT 
  p.*,
  au.email
FROM public.profiles p
JOIN auth.users au ON p.id = au.id;

-- Seed data
INSERT INTO domains (name, description, color_code, icon) VALUES
('STEM', 'Science, Technology, Engineering, Mathematics', '#3B82F6', 'science'),
('Humanities', 'Literature, History, Philosophy, Arts', '#10B981', 'book'),
('Languages', 'Foreign Languages, Linguistics', '#F59E0B', 'translate'),
('Professional', 'Business, Finance, Law, Medicine', '#8B5CF6', 'briefcase'),
('Creative', 'Art, Music, Design, Writing', '#EC4899', 'palette');
