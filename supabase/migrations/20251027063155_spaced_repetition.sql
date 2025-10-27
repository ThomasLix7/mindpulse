-- Spaced Repetition
CREATE TABLE scheduled_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  concept_id UUID REFERENCES concepts(id) ON DELETE CASCADE,
  review_type TEXT NOT NULL, -- 'spaced_repetition', 'milestone', 'difficult'
  scheduled_date TIMESTAMP WITH TIME ZONE NOT NULL,
  interval_days INTEGER, -- Days since last review
  ease_factor DECIMAL DEFAULT 2.5, -- SM-2 algorithm factor
  repetitions INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending', -- 'pending', 'completed', 'skipped'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE review_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_review_id UUID REFERENCES scheduled_reviews(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  concept_id UUID REFERENCES concepts(id) ON DELETE CASCADE,
  performance_rating INTEGER, -- 0-5 scale (SM-2 algorithm)
  time_spent INTEGER, -- seconds
  confidence_level DECIMAL, -- 1-10 scale
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_scheduled_reviews_user_id ON scheduled_reviews(user_id);
CREATE INDEX idx_scheduled_reviews_scheduled_date ON scheduled_reviews(scheduled_date);
CREATE INDEX idx_review_sessions_user_id ON review_sessions(user_id);

ALTER TABLE scheduled_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access their own scheduled reviews" ON scheduled_reviews FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can access their own review sessions" ON review_sessions FOR ALL USING (auth.uid() = user_id);
