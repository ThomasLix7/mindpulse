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

CREATE INDEX idx_concepts_subject_id ON concepts(subject_id);
CREATE INDEX idx_concept_prerequisites_concept_id ON concept_prerequisites(concept_id);
CREATE INDEX idx_user_concept_mastery_user_id ON user_concept_mastery(user_id);

ALTER TABLE concepts ENABLE ROW LEVEL SECURITY;
ALTER TABLE concept_prerequisites ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_concept_mastery ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access concepts" ON concepts FOR SELECT USING (true);
CREATE POLICY "Users can access concept prerequisites" ON concept_prerequisites FOR SELECT USING (true);
CREATE POLICY "Users can access their own concept mastery" ON user_concept_mastery FOR ALL USING (auth.uid() = user_id);
