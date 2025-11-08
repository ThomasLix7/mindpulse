CREATE TABLE courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  learning_path_id UUID REFERENCES learning_paths(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  course_order INTEGER DEFAULT 0,
  curriculum JSONB NOT NULL DEFAULT '{"lessons": []}'::jsonb,
  current_lesson_index INTEGER DEFAULT 0,
  current_topic_index INTEGER DEFAULT 0,
  current_topic_id TEXT,
  completed_topic_ids JSONB DEFAULT '[]'::jsonb,
  estimated_duration_hours INTEGER,
  status TEXT DEFAULT 'active',
  progress_percentage INTEGER DEFAULT 0,
  completion_date TIMESTAMP WITH TIME ZONE,
  skills_mastered JSONB DEFAULT '[]'::jsonb,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE course_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'text',
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  assessment_type TEXT NOT NULL,
  status TEXT DEFAULT 'in_progress',
  total_items INTEGER,
  overall_score DECIMAL,
  confidence_level DECIMAL,
  time_spent INTEGER,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE assessment_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID REFERENCES assessments(id) ON DELETE CASCADE,
  item_order INTEGER NOT NULL,
  item_type TEXT NOT NULL,
  question_text TEXT NOT NULL,
  correct_answer TEXT,
  user_answer TEXT,
  is_correct BOOLEAN,
  confidence_score DECIMAL,
  response_time INTEGER,
  error_type TEXT,
  level TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE learning_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  progress_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending',
  completed_at TIMESTAMP WITH TIME ZONE,
  time_spent INTEGER,
  score DECIMAL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_courses_user_id ON courses(user_id);
CREATE INDEX idx_courses_learning_path_id ON courses(learning_path_id);
CREATE INDEX idx_courses_status ON courses(status);
CREATE INDEX idx_courses_course_order ON courses(learning_path_id, course_order);
CREATE INDEX idx_course_messages_course_id ON course_messages(course_id);
CREATE INDEX idx_assessments_user_id ON assessments(user_id);
CREATE INDEX idx_assessments_course_id ON assessments(course_id);
CREATE INDEX idx_assessment_items_assessment_id ON assessment_items(assessment_id);
CREATE INDEX idx_learning_progress_user_id ON learning_progress(user_id);
CREATE INDEX idx_learning_progress_course_id ON learning_progress(course_id);

ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access their own courses" ON courses FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can access their own course messages" ON course_messages FOR ALL USING (auth.uid() = (SELECT user_id FROM courses WHERE id = course_id));
CREATE POLICY "Users can access their own assessments" ON assessments FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can access their own assessment items" ON assessment_items FOR ALL USING (auth.uid() = (SELECT user_id FROM assessments WHERE id = assessment_id));
CREATE POLICY "Users can access their own learning progress" ON learning_progress FOR ALL USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_courses_updated_at ON courses;
CREATE TRIGGER update_courses_updated_at
BEFORE UPDATE ON courses
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION update_learning_path_on_course_completion()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' AND NEW.learning_path_id IS NOT NULL THEN
    UPDATE learning_paths
    SET 
      completed_courses_count = completed_courses_count + 1,
      active_courses_count = GREATEST(0, active_courses_count - 1),
      overall_progress = (
        SELECT COALESCE(AVG(progress_percentage), 0)::INTEGER
        FROM courses
        WHERE learning_path_id = NEW.learning_path_id
      ),
      updated_at = NOW()
    WHERE id = NEW.learning_path_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_course_completion
AFTER UPDATE ON courses
FOR EACH ROW
WHEN (NEW.status = 'completed' AND OLD.status != 'completed')
EXECUTE FUNCTION update_learning_path_on_course_completion();

CREATE OR REPLACE FUNCTION update_learning_path_course_count()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.learning_path_id IS NOT NULL THEN
    UPDATE learning_paths
    SET 
      active_courses_count = (
        SELECT COUNT(*)
        FROM courses
        WHERE learning_path_id = NEW.learning_path_id 
          AND status = 'active'
      ),
      updated_at = NOW()
    WHERE id = NEW.learning_path_id;
  END IF;
  IF OLD.learning_path_id IS NOT NULL AND (OLD.learning_path_id != NEW.learning_path_id OR NEW.learning_path_id IS NULL) THEN
    UPDATE learning_paths
    SET 
      active_courses_count = (
        SELECT COUNT(*)
        FROM courses
        WHERE learning_path_id = OLD.learning_path_id 
          AND status = 'active'
      ),
      updated_at = NOW()
    WHERE id = OLD.learning_path_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_course_status_change
AFTER INSERT OR UPDATE ON courses
FOR EACH ROW
EXECUTE FUNCTION update_learning_path_course_count();

CREATE OR REPLACE FUNCTION sync_skills_to_user_skills()
RETURNS TRIGGER AS $$
DECLARE
  skill_record JSONB;
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' AND NEW.skills_mastered IS NOT NULL THEN
    FOR skill_record IN SELECT * FROM jsonb_array_elements(NEW.skills_mastered)
    LOOP
      INSERT INTO user_skills (user_id, skill_name, proficiency_level, category, last_updated)
      VALUES (
        NEW.user_id,
        skill_record->>'name',
        COALESCE(skill_record->>'proficiency', 'intermediate'),
        COALESCE(skill_record->>'category', 'technical'),
        NOW()
      )
      ON CONFLICT (user_id, skill_name) DO UPDATE
      SET 
        proficiency_level = CASE 
          WHEN skill_record->>'proficiency' = 'expert' THEN 'expert'
          WHEN skill_record->>'proficiency' = 'advanced' AND user_skills.proficiency_level != 'expert' THEN 'advanced'
          WHEN skill_record->>'proficiency' = 'intermediate' AND user_skills.proficiency_level IN ('beginner', 'intermediate') THEN 'intermediate'
          ELSE user_skills.proficiency_level
        END,
        last_updated = NOW();
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_course_complete_sync_skills
AFTER UPDATE ON courses
FOR EACH ROW
WHEN (NEW.status = 'completed' AND OLD.status != 'completed')
EXECUTE FUNCTION sync_skills_to_user_skills();

CREATE OR REPLACE FUNCTION get_current_topic(course_id_param UUID)
RETURNS JSONB AS $$
DECLARE
  path_record RECORD;
  current_topic JSONB;
  lesson_obj JSONB;
BEGIN
  SELECT curriculum, current_lesson_index, current_topic_index
  INTO path_record
  FROM courses
  WHERE id = course_id_param;

  IF path_record IS NULL THEN
    RETURN NULL;
  END IF;

  IF path_record.curriculum->'lessons' IS NOT NULL AND 
     jsonb_array_length(path_record.curriculum->'lessons') > path_record.current_lesson_index THEN
    lesson_obj := path_record.curriculum->'lessons'->path_record.current_lesson_index;
    
    IF lesson_obj->'topics' IS NOT NULL AND 
       jsonb_array_length(lesson_obj->'topics') > path_record.current_topic_index THEN
      current_topic := lesson_obj->'topics'->path_record.current_topic_index;
      RETURN current_topic;
    END IF;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
