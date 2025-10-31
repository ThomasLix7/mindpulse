CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id),
  username text,
  avatar_url text,
  age_range text,
  education_level text,
  career_target text,
  learning_preferences jsonb,
  preferred_languages jsonb,
  accessibility_needs jsonb,
  timezone text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE user_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_name text NOT NULL,
  proficiency_level text NOT NULL,
  category text,
  last_updated timestamptz DEFAULT now(),
  UNIQUE(user_id, skill_name)
);

CREATE TABLE learning_paths (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  goal TEXT NOT NULL,
  description TEXT,
  domain TEXT,
  subject TEXT,
  level TEXT DEFAULT 'medium',
  target_completion_date TIMESTAMP WITH TIME ZONE,
  status TEXT DEFAULT 'active',
  priority INTEGER DEFAULT 3,
  active_courses_count INTEGER DEFAULT 0,
  completed_courses_count INTEGER DEFAULT 0,
  overall_progress INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX profiles_username_idx ON public.profiles (username);
CREATE INDEX user_skills_user_id_idx ON user_skills(user_id);
CREATE INDEX user_skills_skill_name_idx ON user_skills(skill_name);
CREATE INDEX user_skills_user_skill_idx ON user_skills(user_id, skill_name);
CREATE INDEX learning_paths_user_id_idx ON learning_paths(user_id);
CREATE INDEX learning_paths_status_idx ON learning_paths(status);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_paths ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User can view own profile" ON public.profiles
FOR SELECT USING (id = auth.uid());

CREATE POLICY "User can update own profile" ON public.profiles
FOR UPDATE USING (id = auth.uid());

CREATE POLICY "User access to own skills" ON user_skills
FOR ALL USING (user_id = auth.uid());

CREATE POLICY "User access to own learning paths" ON learning_paths
FOR ALL USING (user_id = auth.uid());

CREATE OR REPLACE VIEW profile_with_email AS
SELECT 
  p.*,
  au.email
FROM public.profiles p
JOIN auth.users au ON p.id = au.id;
