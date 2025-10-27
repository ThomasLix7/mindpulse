-- Compliance System
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL, -- 'assessment_started', 'curriculum_generated', 'goal_adjusted'
  resource_type TEXT, -- 'assessment', 'curriculum', 'goal'
  resource_id UUID,
  old_values JSONB,
  new_values JSONB,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE user_consent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL, -- 'data_collection', 'analytics', 'personalization'
  granted BOOLEAN NOT NULL,
  consent_text TEXT,
  granted_at TIMESTAMP WITH TIME ZONE,
  revoked_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE model_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  decision_type TEXT NOT NULL, -- 'difficulty_adjustment', 'content_recommendation', 'style_selection'
  input_data JSONB,
  model_output JSONB,
  reasoning TEXT,
  confidence_score DECIMAL,
  bias_flags JSONB, -- Potential bias indicators
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  age_range TEXT, -- '18-25', '26-35', etc.
  education_level TEXT, -- 'high_school', 'bachelor', 'master', 'phd'
  learning_experience TEXT, -- 'beginner', 'intermediate', 'advanced'
  preferred_languages JSONB, -- Array of language codes
  accessibility_needs JSONB, -- Accessibility requirements
  timezone TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_model_decisions_user_id ON model_decisions(user_id);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_consent ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access their own audit logs" ON audit_logs FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can access their own consent" ON user_consent FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can access their own model decisions" ON model_decisions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can access their own profile" ON user_profiles FOR ALL USING (auth.uid() = user_id);
