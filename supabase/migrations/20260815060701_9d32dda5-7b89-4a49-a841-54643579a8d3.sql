CREATE TABLE IF NOT EXISTS public.login_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES public.app_accounts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  device TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '5 minutes')
);
REVOKE ALL ON public.login_requests FROM anon, authenticated;
GRANT ALL ON public.login_requests TO service_role;
ALTER TABLE public.login_requests ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.parent_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES public.app_accounts(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  telegram_id BIGINT,
  linked_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT true,
  notify_freq TEXT NOT NULL DEFAULT 'weekly',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS parent_links_account_idx ON public.parent_links(account_id);
CREATE INDEX IF NOT EXISTS parent_links_tg_idx ON public.parent_links(telegram_id);
REVOKE ALL ON public.parent_links FROM anon, authenticated;
GRANT ALL ON public.parent_links TO service_role;
ALTER TABLE public.parent_links ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.tg_login_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.app_accounts(id) ON DELETE CASCADE,
  code text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tg_login_codes_account ON public.tg_login_codes (account_id, created_at DESC);
REVOKE ALL ON public.tg_login_codes FROM anon, authenticated;
GRANT ALL ON public.tg_login_codes TO service_role;
ALTER TABLE public.tg_login_codes ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.known_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fingerprint text NOT NULL,
  label text,
  city text,
  ip text,
  approved boolean NOT NULL DEFAULT false,
  revoked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, fingerprint)
);
REVOKE ALL ON public.known_devices FROM anon, authenticated;
GRANT ALL ON public.known_devices TO service_role;
ALTER TABLE public.known_devices ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.login_bans (
  ip text PRIMARY KEY,
  until timestamptz NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.login_bans FROM anon, authenticated;
GRANT ALL ON public.login_bans TO service_role;
ALTER TABLE public.login_bans ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.gemini_keys ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.gemini_keys ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'global';
ALTER TABLE public.gemini_keys ADD COLUMN IF NOT EXISTS last_ok_at timestamptz;
ALTER TABLE public.gemini_keys ADD COLUMN IF NOT EXISTS last_error text;
ALTER TABLE public.gemini_keys ADD COLUMN IF NOT EXISTS cooldown_until timestamptz;
ALTER TABLE public.gemini_keys ADD COLUMN IF NOT EXISTS calls_today integer NOT NULL DEFAULT 0;
ALTER TABLE public.gemini_keys ADD COLUMN IF NOT EXISTS calls_day date;
ALTER TABLE public.gemini_keys ADD COLUMN IF NOT EXISTS calls_total integer NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS gemini_keys_api_key_uniq ON public.gemini_keys (api_key);