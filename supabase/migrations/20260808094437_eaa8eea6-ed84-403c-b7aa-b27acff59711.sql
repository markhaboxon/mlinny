-- 1) Explicit deny policies for server-only tables (intent made explicit; still fail-closed)
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

-- 2) Notifications: creation/removal is server-side only, stated explicitly
CREATE POLICY "No client insert of notifications" ON public.notifications FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY "No client delete of notifications" ON public.notifications FOR DELETE TO anon, authenticated USING (false);

-- 3) Internal SECURITY DEFINER helpers must not be callable over the API
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_group_member(uuid, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_group_teacher(uuid, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.teaches_student(uuid, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_teacher_role() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM anon, authenticated;