-- profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id uuid PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text,
  email text,
  gender text CHECK (gender IN ('male','female')),
  age int CHECK (age BETWEEN 3 AND 120),
  level_chosen text CHECK (level_chosen IN ('past','orta','yaxshi')),
  placement_score int,
  placement_stars int,
  placement_count int,
  difficulty text NOT NULL DEFAULT 'orta' CHECK (difficulty IN ('oson','orta','qiyin')),
  theme text NOT NULL DEFAULT 'light' CHECK (theme IN ('light','dark')),
  streak int NOT NULL DEFAULT 0,
  best_streak int NOT NULL DEFAULT 0,
  last_visit date,
  last_view text,
  onboarded boolean NOT NULL DEFAULT false,
  linny_intro_seen boolean NOT NULL DEFAULT false,
  daily_word_count integer NOT NULL DEFAULT 10,
  vocab_last_generated date,
  vocab_last_test_date date,
  vocab_setup_done boolean NOT NULL DEFAULT false,
  vocab_source text,
  vocab_bank_ready boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own profile read" ON public.profiles;
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "own profile insert" ON public.profiles;
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "own profile update" ON public.profiles;
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- mistakes
CREATE TABLE IF NOT EXISTS public.mistakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  question text NOT NULL,
  wrong_answer text,
  correct_answer text NOT NULL,
  explanation text,
  tag text,
  skill text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mistakes TO authenticated;
GRANT ALL ON public.mistakes TO service_role;
ALTER TABLE public.mistakes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own mistakes" ON public.mistakes;
CREATE POLICY "own mistakes" ON public.mistakes FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS mistakes_user_tag_idx ON public.mistakes(user_id, tag);
CREATE INDEX IF NOT EXISTS mistakes_user_created_idx ON public.mistakes(user_id, created_at DESC);

-- learned_words
CREATE TABLE IF NOT EXISTS public.learned_words (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  word text NOT NULL,
  translation text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, word)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.learned_words TO authenticated;
GRANT ALL ON public.learned_words TO service_role;
ALTER TABLE public.learned_words ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own learned words" ON public.learned_words;
CREATE POLICY "own learned words" ON public.learned_words FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- daily_progress
CREATE TABLE IF NOT EXISTS public.daily_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  day date NOT NULL,
  UNIQUE (user_id, day)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_progress TO authenticated;
GRANT ALL ON public.daily_progress TO service_role;
ALTER TABLE public.daily_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own daily progress" ON public.daily_progress;
CREATE POLICY "own daily progress" ON public.daily_progress FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- vocab_words
CREATE TABLE IF NOT EXISTS public.vocab_words (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  word text NOT NULL,
  translation text NOT NULL,
  pronunciation text,
  example text,
  example_uz text,
  topic text,
  assigned_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  learned_at timestamptz,
  is_favorite boolean NOT NULL DEFAULT false,
  favorited_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vocab_words TO authenticated;
GRANT ALL ON public.vocab_words TO service_role;
ALTER TABLE public.vocab_words ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own vocab words" ON public.vocab_words;
CREATE POLICY "own vocab words" ON public.vocab_words FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS vocab_words_user_date_idx ON public.vocab_words(user_id, assigned_date);
CREATE INDEX IF NOT EXISTS vocab_words_user_fav_idx ON public.vocab_words(user_id, is_favorite) WHERE is_favorite = true;

-- vocab_bank
CREATE TABLE IF NOT EXISTS public.vocab_bank (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  word text NOT NULL,
  translation text,
  cefr text NOT NULL DEFAULT 'A1',
  level_rank integer NOT NULL DEFAULT 1,
  position integer NOT NULL DEFAULT 0,
  used boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, word)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vocab_bank TO authenticated;
GRANT ALL ON public.vocab_bank TO service_role;
ALTER TABLE public.vocab_bank ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own vocab bank" ON public.vocab_bank;
CREATE POLICY "own vocab bank" ON public.vocab_bank FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS vocab_bank_pick_idx ON public.vocab_bank (user_id, used, level_rank, position);

-- gemini_keys (server-only)
CREATE TABLE IF NOT EXISTS public.gemini_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key text NOT NULL UNIQUE,
  label text,
  added_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.gemini_keys FROM anon, authenticated;
GRANT ALL ON public.gemini_keys TO service_role;
ALTER TABLE public.gemini_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "No client read of api keys" ON public.gemini_keys;
CREATE POLICY "No client read of api keys" ON public.gemini_keys FOR SELECT TO anon, authenticated USING (false);
DROP POLICY IF EXISTS "No client insert of api keys" ON public.gemini_keys;
CREATE POLICY "No client insert of api keys" ON public.gemini_keys FOR INSERT TO anon, authenticated WITH CHECK (false);
DROP POLICY IF EXISTS "No client update of api keys" ON public.gemini_keys;
CREATE POLICY "No client update of api keys" ON public.gemini_keys FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "No client delete of api keys" ON public.gemini_keys;
CREATE POLICY "No client delete of api keys" ON public.gemini_keys FOR DELETE TO anon, authenticated USING (false);
COMMENT ON TABLE public.gemini_keys IS 'Sensitive AI credentials. Rows are inserted and read only by trusted server-side code using the service role.';

-- triggers
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER
  LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'), NEW.email)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;