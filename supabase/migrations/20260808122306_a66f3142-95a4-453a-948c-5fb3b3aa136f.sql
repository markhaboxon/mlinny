CREATE OR REPLACE FUNCTION public.teacher_student_activity(_sid uuid, _days int DEFAULT 30)
RETURNS TABLE (day date, active int, mistakes bigint, learned bigint) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.teaches_student(auth.uid(), _sid) THEN RAISE EXCEPTION 'Ruxsat yo''q'; END IF;
  RETURN QUERY
  SELECT d::date,
    (SELECT CASE WHEN count(*) > 0 THEN 1 ELSE 0 END::int FROM public.daily_progress p WHERE p.user_id = _sid AND p.day = d::date),
    (SELECT count(*) FROM public.mistakes x WHERE x.user_id = _sid AND x.created_at::date = d::date),
    (SELECT count(*) FROM public.learned_words l WHERE l.user_id = _sid AND l.created_at::date = d::date)
  FROM generate_series(current_date - (_days - 1), current_date, interval '1 day') d
  ORDER BY 1;
END $$;
CREATE OR REPLACE FUNCTION public.teacher_student_mistakes(_sid uuid, _limit int DEFAULT 100)
RETURNS TABLE (question text, wrong_answer text, correct_answer text, explanation text, tag text, skill text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.teaches_student(auth.uid(), _sid) THEN RAISE EXCEPTION 'Ruxsat yo''q'; END IF;
  RETURN QUERY
  SELECT x.question, x.wrong_answer, x.correct_answer, x.explanation, x.tag, x.skill, x.created_at
  FROM public.mistakes x WHERE x.user_id = _sid ORDER BY x.created_at DESC LIMIT _limit;
END $$;
CREATE OR REPLACE FUNCTION public.teacher_groups_overview()
RETURNS TABLE (
  group_id uuid, name text, join_code text, lesson_days smallint[], archived boolean,
  students bigint, active_today bigint, active_7 bigint, avg_streak numeric, avg_accuracy numeric, at_risk bigint
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT g.id, g.name, g.join_code, g.lesson_days, g.archived,
    (SELECT count(*) FROM public.group_members m WHERE m.group_id = g.id),
    (SELECT count(*) FROM public.group_members m JOIN public.profiles p ON p.user_id = m.student_id
      WHERE m.group_id = g.id AND p.last_visit = current_date),
    (SELECT count(DISTINCT d.user_id) FROM public.daily_progress d
      WHERE d.user_id IN (SELECT student_id FROM public.group_members WHERE group_id = g.id) AND d.day > current_date - 7),
    (SELECT coalesce(round(avg(coalesce(p.streak,0)),1),0) FROM public.group_members m LEFT JOIN public.profiles p ON p.user_id = m.student_id WHERE m.group_id = g.id),
    (SELECT coalesce(round(avg(
        CASE WHEN lw.c + mk.c = 0 THEN 0 ELSE 100.0 * lw.c / (lw.c + mk.c) END), 0), 0)
      FROM public.group_members m
      CROSS JOIN LATERAL (SELECT count(*) c FROM public.learned_words l WHERE l.user_id = m.student_id) lw
      CROSS JOIN LATERAL (SELECT count(*) c FROM public.mistakes x WHERE x.user_id = m.student_id) mk
      WHERE m.group_id = g.id),
    (SELECT count(*) FROM public.group_members m LEFT JOIN public.profiles p ON p.user_id = m.student_id
      WHERE m.group_id = g.id AND (p.last_visit IS NULL OR p.last_visit < current_date - 3))
  FROM public.groups g
  WHERE g.teacher_id = auth.uid()
  ORDER BY g.archived, g.created_at;
$$;
CREATE OR REPLACE FUNCTION public.teacher_weekly_report(_gid uuid)
RETURNS TABLE (
  students bigint, active_students bigint, total_active_days bigint,
  new_mistakes bigint, learned_words bigint, assignments_done bigint, assignments_total bigint,
  best_student text, weakest_topic text
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_group_teacher(auth.uid(), _gid) THEN RAISE EXCEPTION 'Ruxsat yo''q'; END IF;
  RETURN QUERY
  WITH ids AS (SELECT student_id FROM public.group_members WHERE group_id = _gid)
  SELECT (SELECT count(*) FROM ids),
    (SELECT count(DISTINCT d.user_id) FROM public.daily_progress d WHERE d.user_id IN (SELECT student_id FROM ids) AND d.day > current_date - 7),
    (SELECT count(*) FROM public.daily_progress d WHERE d.user_id IN (SELECT student_id FROM ids) AND d.day > current_date - 7),
    (SELECT count(*) FROM public.mistakes x WHERE x.user_id IN (SELECT student_id FROM ids) AND x.created_at > now() - interval '7 days'),
    (SELECT count(*) FROM public.learned_words l WHERE l.user_id IN (SELECT student_id FROM ids) AND l.created_at > now() - interval '7 days'),
    (SELECT count(*) FROM public.assignment_completions c JOIN public.assignments a ON a.id = c.assignment_id
       WHERE a.group_id = _gid AND c.completed_at > now() - interval '7 days'),
    (SELECT count(*) FROM public.assignments a WHERE a.group_id = _gid AND a.created_at > now() - interval '7 days'),
    (SELECT coalesce(p.name,'—') FROM public.daily_progress d JOIN public.profiles p ON p.user_id = d.user_id
       WHERE d.user_id IN (SELECT student_id FROM ids) AND d.day > current_date - 7
       GROUP BY p.name ORDER BY count(*) DESC LIMIT 1),
    (SELECT x.tag FROM public.mistakes x WHERE x.user_id IN (SELECT student_id FROM ids)
       AND x.created_at > now() - interval '7 days' AND x.tag IS NOT NULL
       GROUP BY x.tag ORDER BY count(*) DESC LIMIT 1);
END $$;
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS lesson_time text;
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS capacity integer NOT NULL DEFAULT 0;
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS finished_at timestamptz;
CREATE TABLE IF NOT EXISTS public.app_accounts (
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
REVOKE ALL ON public.app_accounts FROM anon, authenticated;
GRANT ALL ON public.app_accounts TO service_role;
ALTER TABLE public.app_accounts ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public.access_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.app_accounts(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.access_links FROM anon, authenticated;
GRANT ALL ON public.access_links TO service_role;
ALTER TABLE public.access_links ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  login text,
  action text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.activity_log FROM anon, authenticated;
GRANT ALL ON public.activity_log TO service_role;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS activity_log_created_idx ON public.activity_log (created_at DESC);
CREATE TABLE IF NOT EXISTS public.notifications (
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
CREATE TABLE IF NOT EXISTS public.group_messages (
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
DROP TRIGGER IF EXISTS app_accounts_updated_at ON public.app_accounts;
CREATE TRIGGER app_accounts_updated_at BEFORE UPDATE ON public.app_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon;', r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role;', r.proname, r.args);
  END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_teacher_role() FROM PUBLIC, anon, authenticated;