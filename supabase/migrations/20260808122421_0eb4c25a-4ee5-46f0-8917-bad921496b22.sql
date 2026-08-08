CREATE POLICY "No client read of app accounts" ON public.app_accounts FOR SELECT TO anon, authenticated USING (false);
CREATE POLICY "No client insert of app accounts" ON public.app_accounts FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY "No client update of app accounts" ON public.app_accounts FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "No client delete of app accounts" ON public.app_accounts FOR DELETE TO anon, authenticated USING (false);
CREATE POLICY "No client read of access links" ON public.access_links FOR SELECT TO anon, authenticated USING (false);
CREATE POLICY "No client insert of access links" ON public.access_links FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY "No client update of access links" ON public.access_links FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "No client delete of access links" ON public.access_links FOR DELETE TO anon, authenticated USING (false);
CREATE POLICY "No client read of activity log" ON public.activity_log FOR SELECT TO anon, authenticated USING (false);
CREATE POLICY "No client insert of activity log" ON public.activity_log FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY "No client update of activity log" ON public.activity_log FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "No client delete of activity log" ON public.activity_log FOR DELETE TO anon, authenticated USING (false);
CREATE POLICY "No client insert of roles" ON public.user_roles FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY "No client update of roles" ON public.user_roles FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "No client delete of roles" ON public.user_roles FOR DELETE TO anon, authenticated USING (false);
CREATE POLICY "No client insert of notifications" ON public.notifications FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY "No client delete of notifications" ON public.notifications FOR DELETE TO anon, authenticated USING (false);

ALTER TABLE public.app_accounts DROP COLUMN IF EXISTS password;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS telegram_id bigint,
  ADD COLUMN IF NOT EXISTS telegram_username text,
  ADD COLUMN IF NOT EXISTS telegram_linked_at timestamptz,
  ADD COLUMN IF NOT EXISTS tg_daily_hour smallint NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS tg_reminders boolean NOT NULL DEFAULT true;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_telegram_id_key ON public.profiles (telegram_id) WHERE telegram_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.telegram_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  used_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '2 days'),
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.telegram_links FROM anon, authenticated;
GRANT ALL ON public.telegram_links TO service_role;
ALTER TABLE public.telegram_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "telegram_links server only" ON public.telegram_links FOR ALL USING (false) WITH CHECK (false);

CREATE TABLE IF NOT EXISTS public.telegram_state (
  chat_id bigint PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.telegram_state FROM anon, authenticated;
GRANT ALL ON public.telegram_state TO service_role;
ALTER TABLE public.telegram_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "telegram_state server only" ON public.telegram_state FOR ALL USING (false) WITH CHECK (false);

CREATE TABLE IF NOT EXISTS public.telegram_updates (
  update_id bigint PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.telegram_updates FROM anon, authenticated;
GRANT ALL ON public.telegram_updates TO service_role;
ALTER TABLE public.telegram_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "telegram_updates server only" ON public.telegram_updates FOR ALL USING (false) WITH CHECK (false);

CREATE TABLE IF NOT EXISTS public.bot_jobs (
  job_key text PRIMARY KEY,
  ran_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.bot_jobs FROM anon, authenticated;
GRANT ALL ON public.bot_jobs TO service_role;
ALTER TABLE public.bot_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bot_jobs server only" ON public.bot_jobs FOR ALL USING (false) WITH CHECK (false);

CREATE TABLE IF NOT EXISTS public.scheduled_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  group_id uuid REFERENCES public.groups(id) ON DELETE CASCADE,
  body text NOT NULL,
  send_at timestamptz NOT NULL,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS scheduled_messages_pending_idx ON public.scheduled_messages (send_at) WHERE sent_at IS NULL;
REVOKE ALL ON public.scheduled_messages FROM anon, authenticated;
GRANT ALL ON public.scheduled_messages TO service_role;
ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scheduled_messages server only" ON public.scheduled_messages FOR ALL USING (false) WITH CHECK (false);

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_group_member(uuid, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_group_teacher(uuid, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.teaches_student(uuid, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_teacher_role() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM anon, authenticated;