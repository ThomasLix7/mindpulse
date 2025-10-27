-- Problem Generation
CREATE TABLE generated_problems (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id UUID REFERENCES concepts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  problem_type TEXT NOT NULL, -- 'drill', 'application', 'creative', 'analysis'
  problem_text TEXT NOT NULL,
  solution TEXT,
  hints JSONB, -- Array of hint texts
  difficulty_level TEXT, -- 'easy', 'medium', 'hard'
  problem_source TEXT, -- 'ai_generated', 'template', 'manual'
  variant_id TEXT, -- For tracking different versions
  metadata JSONB, -- Additional problem data
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE problem_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  problem_id UUID REFERENCES generated_problems(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  user_answer TEXT,
  is_correct BOOLEAN,
  time_spent INTEGER, -- seconds
  hints_used INTEGER DEFAULT 0,
  attempts_count INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_generated_problems_concept_id ON generated_problems(concept_id);
CREATE INDEX idx_generated_problems_user_id ON generated_problems(user_id);
CREATE INDEX idx_problem_attempts_problem_id ON problem_attempts(problem_id);

ALTER TABLE generated_problems ENABLE ROW LEVEL SECURITY;
ALTER TABLE problem_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access their own generated problems" ON generated_problems FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can access their own problem attempts" ON problem_attempts FOR ALL USING (auth.uid() = user_id);
