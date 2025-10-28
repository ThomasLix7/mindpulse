-- Learning System
-- Concept management and learning features

-- Concept Management
CREATE TABLE concepts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  concept_type TEXT NOT NULL, -- 'fact', 'procedure', 'principle', 'skill'
  abstraction_level INTEGER DEFAULT 1, -- 1-10 (concrete to abstract)
  complexity INTEGER DEFAULT 1, -- 1-10 (simple to complex)
  difficulty_rating INTEGER DEFAULT 1, -- 1-10
  learning_objectives JSONB,
  assessment_criteria JSONB,
  metadata JSONB, -- Additional flexible data
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE concept_prerequisites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id UUID REFERENCES concepts(id) ON DELETE CASCADE,
  prerequisite_concept_id UUID REFERENCES concepts(id) ON DELETE CASCADE,
  prerequisite_type TEXT DEFAULT 'required', -- 'required', 'recommended', 'helpful'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(concept_id, prerequisite_concept_id)
);

CREATE TABLE user_concept_mastery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  concept_id UUID REFERENCES concepts(id) ON DELETE CASCADE,
  mastery_level INTEGER DEFAULT 1, -- 1-10 scale
  last_practiced TIMESTAMP WITH TIME ZONE,
  times_practiced INTEGER DEFAULT 0,
  success_rate DECIMAL DEFAULT 0.0, -- 0.0 to 1.0
  confidence_level DECIMAL DEFAULT 0.0, -- 0.0 to 1.0
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, concept_id)
);

-- Indexes
CREATE INDEX idx_concepts_subject_id ON concepts(subject_id);
CREATE INDEX idx_concept_prerequisites_concept_id ON concept_prerequisites(concept_id);
CREATE INDEX idx_user_concept_mastery_user_id ON user_concept_mastery(user_id);

-- Row Level Security
ALTER TABLE concepts ENABLE ROW LEVEL SECURITY;
ALTER TABLE concept_prerequisites ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_concept_mastery ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can access concepts" ON concepts FOR SELECT USING (true);
CREATE POLICY "Users can access concept prerequisites" ON concept_prerequisites FOR SELECT USING (true);
CREATE POLICY "Users can access their own concept mastery" ON user_concept_mastery FOR ALL USING (auth.uid() = user_id);


-- Basic Assessments
CREATE TABLE assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  learning_goal_id UUID REFERENCES learning_goals(id) ON DELETE CASCADE,
  assessment_type TEXT NOT NULL, -- 'diagnostic', 'formative', 'summative'
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
  concept_id UUID,
  difficulty_level TEXT, -- 'easy', 'medium', 'hard'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Learning Progress
CREATE TABLE learning_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  concept_id UUID,
  learning_goal_id UUID REFERENCES learning_goals(id) ON DELETE CASCADE,
  progress_type TEXT NOT NULL, -- 'lesson', 'practice', 'assessment', 'review'
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'skipped'
  completed_at TIMESTAMP WITH TIME ZONE,
  time_spent INTEGER, -- minutes
  score DECIMAL, -- 0-100
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Indexes
CREATE INDEX idx_assessments_user_id ON assessments(user_id);
CREATE INDEX idx_assessments_goal_id ON assessments(learning_goal_id);
CREATE INDEX idx_assessment_items_assessment_id ON assessment_items(assessment_id);
CREATE INDEX idx_learning_progress_user_id ON learning_progress(user_id);
CREATE INDEX idx_learning_progress_concept_id ON learning_progress(concept_id);

-- Row Level Security
ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_progress ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can access their own assessments" ON assessments FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can access their own assessment items" ON assessment_items FOR ALL USING (auth.uid() = (SELECT user_id FROM assessments WHERE id = assessment_id));
CREATE POLICY "Users can access their own learning progress" ON learning_progress FOR ALL USING (auth.uid() = user_id);

ALTER TABLE learning_progress 
ADD CONSTRAINT fk_learning_progress_concept_id 
FOREIGN KEY (concept_id) REFERENCES concepts(id) ON DELETE CASCADE;

ALTER TABLE assessment_items 
ADD CONSTRAINT fk_assessment_items_concept_id 
FOREIGN KEY (concept_id) REFERENCES concepts(id) ON DELETE SET NULL;