-- IELTS module -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ielts_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('listening','reading')),
  variant text NOT NULL DEFAULT 'academic' CHECK (variant IN ('academic','general')),
  section integer NOT NULL DEFAULT 1,
  title text NOT NULL,
  topic text,
  payload jsonb NOT NULL,
  source text NOT NULL DEFAULT 'ai' CHECK (source IN ('ai','manual')),
  active boolean NOT NULL DEFAULT true,
  uses integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ielts_materials_lookup ON public.ielts_materials (kind, variant, section, active);
REVOKE ALL ON public.ielts_materials FROM anon, authenticated;
GRANT ALL ON public.ielts_materials TO service_role;
ALTER TABLE public.ielts_materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ielts_materials server only" ON public.ielts_materials FOR ALL USING (false) WITH CHECK (false);

CREATE TABLE IF NOT EXISTS public.ielts_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  skill text NOT NULL CHECK (skill IN ('listening','reading','writing','speaking')),
  variant text NOT NULL DEFAULT 'academic',
  mock_id uuid,
  material_ids uuid[] NOT NULL DEFAULT '{}',
  prompt jsonb,
  practice boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz
);
CREATE INDEX IF NOT EXISTS ielts_sessions_user_idx ON public.ielts_sessions (user_id, started_at DESC);
REVOKE ALL ON public.ielts_sessions FROM anon, authenticated;
GRANT ALL ON public.ielts_sessions TO service_role;
ALTER TABLE public.ielts_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ielts_sessions server only" ON public.ielts_sessions FOR ALL USING (false) WITH CHECK (false);

CREATE TABLE IF NOT EXISTS public.ielts_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  skill text NOT NULL CHECK (skill IN ('listening','reading','writing','speaking','mock')),
  variant text NOT NULL DEFAULT 'academic',
  band numeric(2,1),
  raw_score integer,
  total integer,
  mock_id uuid,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ielts_attempts_user_idx ON public.ielts_attempts (user_id, created_at DESC);
REVOKE ALL ON public.ielts_attempts FROM anon;
GRANT SELECT ON public.ielts_attempts TO authenticated;
GRANT ALL ON public.ielts_attempts TO service_role;
ALTER TABLE public.ielts_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ielts attempts readable" ON public.ielts_attempts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ielts_variant text NOT NULL DEFAULT 'academic',
  ADD COLUMN IF NOT EXISTS ielts_target_band numeric(2,1);