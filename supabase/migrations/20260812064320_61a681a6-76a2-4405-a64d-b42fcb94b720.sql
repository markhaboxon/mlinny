
CREATE TABLE public.tg_login_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.app_accounts(id) ON DELETE CASCADE,
  code text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tg_login_codes_account ON public.tg_login_codes (account_id, created_at DESC);
GRANT ALL ON public.tg_login_codes TO service_role;
ALTER TABLE public.tg_login_codes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.known_devices (
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
GRANT ALL ON public.known_devices TO service_role;
ALTER TABLE public.known_devices ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.login_bans (
  ip text PRIMARY KEY,
  until timestamptz NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.login_bans TO service_role;
ALTER TABLE public.login_bans ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.parent_links ADD COLUMN IF NOT EXISTS notify_freq text NOT NULL DEFAULT 'weekly';
