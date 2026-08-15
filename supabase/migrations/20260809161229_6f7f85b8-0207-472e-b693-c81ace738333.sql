-- duel_matches: least-privilege grants + participant-scoped UPDATE policy
REVOKE ALL ON public.duel_matches FROM anon;
REVOKE ALL ON public.duel_matches FROM authenticated;
GRANT SELECT, UPDATE ON public.duel_matches TO authenticated;
GRANT ALL ON public.duel_matches TO service_role;

DROP POLICY IF EXISTS "duel participants update" ON public.duel_matches;
CREATE POLICY "duel participants update"
ON public.duel_matches FOR UPDATE TO authenticated
USING (auth.uid() = p1 OR auth.uid() = p2)
WITH CHECK (auth.uid() = p1 OR auth.uid() = p2);

-- group_members: joins only through join_group_by_code (SECURITY DEFINER)
REVOKE ALL ON public.group_members FROM anon;
REVOKE ALL ON public.group_members FROM authenticated;
GRANT SELECT, DELETE ON public.group_members TO authenticated;
GRANT ALL ON public.group_members TO service_role;

-- SECURITY DEFINER hardening: quota helper must not be callable by end users
REVOKE ALL ON FUNCTION public.consume_ai_quota(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_ai_quota(text, integer) FROM anon;
REVOKE ALL ON FUNCTION public.consume_ai_quota(text, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_quota(text, integer) TO service_role;

REVOKE ALL ON FUNCTION public.run_league_rollover() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.run_league_rollover() FROM anon;
REVOKE ALL ON FUNCTION public.run_league_rollover() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.run_league_rollover() TO service_role;

DROP POLICY IF EXISTS "teacher manages messages" ON public.group_messages;

CREATE POLICY "teacher manages messages" ON public.group_messages
FOR ALL TO authenticated
USING (
  auth.uid() = teacher_id
  AND public.has_role(auth.uid(), 'teacher')
  AND (group_id IS NULL OR public.is_group_teacher(auth.uid(), group_id))
)
WITH CHECK (
  auth.uid() = teacher_id
  AND public.has_role(auth.uid(), 'teacher')
  AND (group_id IS NULL OR public.is_group_teacher(auth.uid(), group_id))
);

DROP POLICY IF EXISTS "duel participants update" ON public.duel_matches;
REVOKE UPDATE ON public.duel_matches FROM authenticated;
REVOKE ALL ON public.duel_matches FROM anon;
GRANT SELECT ON public.duel_matches TO authenticated;