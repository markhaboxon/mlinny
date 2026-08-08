
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS lesson_time text;
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS capacity integer NOT NULL DEFAULT 0;
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS finished_at timestamptz;

CREATE TABLE public.app_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE,
  login text NOT NULL UNIQUE,
  password text NOT NULL,
  kind text NOT NULL DEFAULT 'user' CHECK (kind IN ('admin','teacher','student','user')),
  full_name text,
  group_id uuid REFERENCES public.groups(id) ON DELETE SET NULL,
  created_by uuid,
  active boolean NOT NULL DEFAULT true,
  first_login_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.app_accounts TO service_role;
ALTER TABLE public.app_accounts ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.access_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.app_accounts(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.access_links TO service_role;
ALTER TABLE public.access_links ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  login text,
  action text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.activity_log TO service_role;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX activity_log_created_idx ON public.activity_log (created_at DESC);

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL,
  group_id uuid REFERENCES public.groups(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own notifications read" ON public.notifications FOR SELECT TO authenticated USING (recipient_id = auth.uid());
CREATE POLICY "own notifications update" ON public.notifications FOR UPDATE TO authenticated USING (recipient_id = auth.uid()) WITH CHECK (recipient_id = auth.uid());

CREATE TABLE public.group_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL,
  group_id uuid REFERENCES public.groups(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.group_messages TO authenticated;
GRANT ALL ON public.group_messages TO service_role;
ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "teacher manages messages" ON public.group_messages FOR ALL TO authenticated
  USING (auth.uid() = teacher_id) WITH CHECK (auth.uid() = teacher_id);
CREATE POLICY "members read messages" ON public.group_messages FOR SELECT TO authenticated
  USING (
    (group_id IS NOT NULL AND public.is_group_member(auth.uid(), group_id))
    OR (group_id IS NULL AND EXISTS (
      SELECT 1 FROM public.group_members m JOIN public.groups g ON g.id = m.group_id
      WHERE m.student_id = auth.uid() AND g.teacher_id = group_messages.teacher_id))
  );

CREATE TRIGGER app_accounts_updated_at BEFORE UPDATE ON public.app_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
