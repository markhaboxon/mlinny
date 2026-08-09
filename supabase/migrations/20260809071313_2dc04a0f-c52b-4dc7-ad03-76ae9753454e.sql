DROP POLICY IF EXISTS "duel participants update" ON public.duel_matches;
REVOKE UPDATE ON public.duel_matches FROM authenticated;
REVOKE ALL ON public.duel_matches FROM anon;
GRANT SELECT ON public.duel_matches TO authenticated;