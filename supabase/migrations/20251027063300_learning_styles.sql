-- Learning Styles
CREATE TABLE explanation_styles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE, -- 'visual', 'auditory', 'kinesthetic', 'analytical'
  description TEXT,
  characteristics JSONB, -- What makes this style unique
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE session_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learning_session_id UUID REFERENCES learning_sessions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  explanation_style_id UUID REFERENCES explanation_styles(id) ON DELETE CASCADE,
  effectiveness_rating INTEGER, -- 1-10 scale
  user_preference_rating INTEGER, -- 1-10 scale
  feedback_text TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_session_feedback_user_id ON session_feedback(user_id);

ALTER TABLE explanation_styles ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access explanation styles" ON explanation_styles FOR SELECT USING (true);
CREATE POLICY "Users can access their own session feedback" ON session_feedback FOR ALL USING (auth.uid() = user_id);

INSERT INTO explanation_styles (name, description, characteristics) VALUES
('Visual', 'Uses diagrams, charts, and visual representations', '{"prefers": ["diagrams", "charts", "infographics"], "avoid": ["long_text"]}'),
('Auditory', 'Uses verbal explanations and discussions', '{"prefers": ["spoken_explanations", "discussions"], "avoid": ["visual_only"]}'),
('Kinesthetic', 'Uses hands-on activities and physical examples', '{"prefers": ["interactive", "practical_examples"], "avoid": ["abstract_only"]}'),
('Analytical', 'Uses step-by-step logical breakdowns', '{"prefers": ["logical_flow", "detailed_steps"], "avoid": ["intuitive"]}'),
('Intuitive', 'Uses analogies and big-picture thinking', '{"prefers": ["analogies", "concepts"], "avoid": ["rote_memorization"]}');
