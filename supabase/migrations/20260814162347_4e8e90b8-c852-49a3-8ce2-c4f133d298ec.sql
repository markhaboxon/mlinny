GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_group_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_group_teacher(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.teaches_student(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_quota(text, integer) TO authenticated;

ALTER TABLE public.gemini_keys ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.gemini_keys ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'global';
ALTER TABLE public.gemini_keys ADD COLUMN IF NOT EXISTS last_ok_at timestamptz;
ALTER TABLE public.gemini_keys ADD COLUMN IF NOT EXISTS last_error text;
ALTER TABLE public.gemini_keys ADD COLUMN IF NOT EXISTS cooldown_until timestamptz;
ALTER TABLE public.gemini_keys ADD COLUMN IF NOT EXISTS calls_today integer NOT NULL DEFAULT 0;
ALTER TABLE public.gemini_keys ADD COLUMN IF NOT EXISTS calls_day date;
ALTER TABLE public.gemini_keys ADD COLUMN IF NOT EXISTS calls_total integer NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS gemini_keys_api_key_uniq ON public.gemini_keys (api_key);