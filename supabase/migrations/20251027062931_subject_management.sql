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

CREATE INDEX idx_subjects_domain_id ON subjects(domain_id);

ALTER TABLE domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access domains" ON domains FOR SELECT USING (true);
CREATE POLICY "Users can access subjects" ON subjects FOR SELECT USING (true);

INSERT INTO domains (name, description, color_code, icon) VALUES
('STEM', 'Science, Technology, Engineering, Mathematics', '#3B82F6', 'science'),
('Humanities', 'Literature, History, Philosophy, Arts', '#10B981', 'book'),
('Languages', 'Foreign Languages, Linguistics', '#F59E0B', 'translate'),
('Professional', 'Business, Finance, Law, Medicine', '#8B5CF6', 'briefcase'),
('Creative', 'Art, Music, Design, Writing', '#EC4899', 'palette');
