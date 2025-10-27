-- Motivation System
CREATE TABLE milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learning_goal_id UUID REFERENCES learning_goals(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  target_date TIMESTAMP WITH TIME ZONE,
  completed_date TIMESTAMP WITH TIME ZONE,
  status TEXT DEFAULT 'pending', -- 'pending', 'completed', 'overdue'
  reward_type TEXT, -- 'badge', 'points', 'unlock'
  reward_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE reflections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  reflection_type TEXT NOT NULL, -- 'weekly', 'session', 'milestone', 'struggle'
  prompt_text TEXT NOT NULL,
  user_response TEXT NOT NULL,
  sentiment_score DECIMAL, -- -1 to 1 scale
  confidence_level DECIMAL, -- 1-10 scale
  learning_goal_id UUID REFERENCES learning_goals(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE goal_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learning_goal_id UUID REFERENCES learning_goals(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  adjustment_type TEXT NOT NULL, -- 'difficulty', 'timeline', 'scope', 'approach'
  old_value TEXT,
  new_value TEXT,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_milestones_user_id ON milestones(user_id);
CREATE INDEX idx_reflections_user_id ON reflections(user_id);
CREATE INDEX idx_goal_adjustments_user_id ON goal_adjustments(user_id);

ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE reflections ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access their own milestones" ON milestones FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can access their own reflections" ON reflections FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can access their own goal adjustments" ON goal_adjustments FOR ALL USING (auth.uid() = user_id);
