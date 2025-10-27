-- Curriculum System
CREATE TABLE curriculum_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  learning_goal_id UUID REFERENCES learning_goals(id) ON DELETE CASCADE,
  plan_name TEXT NOT NULL,
  status TEXT DEFAULT 'active', -- 'active', 'paused', 'completed', 'archived'
  total_steps INTEGER,
  completed_steps INTEGER DEFAULT 0,
  estimated_duration INTEGER, -- days
  actual_duration INTEGER, -- days
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE curriculum_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curriculum_plan_id UUID REFERENCES curriculum_plans(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  step_type TEXT NOT NULL, -- 'lesson', 'practice', 'assessment', 'review'
  title TEXT NOT NULL,
  description TEXT,
  concept_id UUID, -- Will reference concepts table when created
  estimated_duration INTEGER, -- minutes
  actual_duration INTEGER, -- minutes
  status TEXT DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'skipped'
  prerequisites JSONB, -- Array of prerequisite step IDs
  learning_objectives JSONB, -- Array of objectives
  resources JSONB, -- Array of resource IDs
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_curriculum_plans_user_id ON curriculum_plans(user_id);
CREATE INDEX idx_curriculum_steps_plan_id ON curriculum_steps(curriculum_plan_id);

ALTER TABLE curriculum_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE curriculum_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access their own curriculum plans" ON curriculum_plans FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can access their own curriculum steps" ON curriculum_steps FOR ALL USING (auth.uid() = (SELECT user_id FROM curriculum_plans WHERE id = curriculum_plan_id));
