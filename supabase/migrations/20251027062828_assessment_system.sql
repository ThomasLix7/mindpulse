-- Assessment System
CREATE TABLE assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  learning_goal_id UUID REFERENCES learning_goals(id) ON DELETE CASCADE,
  assessment_type TEXT NOT NULL, -- 'diagnostic', 'formative', 'summative', 'adaptive'
  status TEXT DEFAULT 'in_progress', -- 'in_progress', 'completed', 'abandoned'
  total_items INTEGER,
  completed_items INTEGER DEFAULT 0,
  overall_score DECIMAL,
  confidence_level DECIMAL, -- 1-10 scale
  time_spent INTEGER, -- seconds
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE assessment_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID REFERENCES assessments(id) ON DELETE CASCADE,
  item_order INTEGER NOT NULL,
  item_type TEXT NOT NULL, -- 'multiple_choice', 'open_ended', 'problem_solving'
  question_text TEXT NOT NULL,
  correct_answer TEXT,
  user_answer TEXT,
  is_correct BOOLEAN,
  confidence_score DECIMAL, -- 1-10 scale
  response_time INTEGER, -- milliseconds
  error_type TEXT, -- 'conceptual', 'procedural', 'careless'
  concept_id UUID, -- Will reference concepts table when created
  difficulty_level TEXT, -- 'easy', 'medium', 'hard'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_assessments_user_id ON assessments(user_id);
CREATE INDEX idx_assessments_goal_id ON assessments(learning_goal_id);
CREATE INDEX idx_assessment_items_assessment_id ON assessment_items(assessment_id);

ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access their own assessments" ON assessments FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can access their own assessment items" ON assessment_items FOR ALL USING (auth.uid() = (SELECT user_id FROM assessments WHERE id = assessment_id));
