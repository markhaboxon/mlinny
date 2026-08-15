CREATE TABLE public.login_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES public.app_accounts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  device TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '5 minutes')
);
GRANT ALL ON public.login_requests TO service_role;
ALTER TABLE public.login_requests ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.parent_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES public.app_accounts(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  telegram_id BIGINT,
  linked_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX parent_links_account_idx ON public.parent_links(account_id);
CREATE INDEX parent_links_tg_idx ON public.parent_links(telegram_id);
GRANT ALL ON public.parent_links TO service_role;
ALTER TABLE public.parent_links ENABLE ROW LEVEL SECURITY;