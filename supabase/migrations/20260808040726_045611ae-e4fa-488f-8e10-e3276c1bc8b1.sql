-- 1. Explicit deny policies for service-role-only tables
CREATE POLICY "No client access to app_accounts select" ON public.app_accounts FOR SELECT TO anon, authenticated USING (false);
CREATE POLICY "No client access to app_accounts insert" ON public.app_accounts FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY "No client access to app_accounts update" ON public.app_accounts FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "No client access to app_accounts delete" ON public.app_accounts FOR DELETE TO anon, authenticated USING (false);

CREATE POLICY "No client access to access_links select" ON public.access_links FOR SELECT TO anon, authenticated USING (false);
CREATE POLICY "No client access to access_links insert" ON public.access_links FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY "No client access to access_links update" ON public.access_links FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "No client access to access_links delete" ON public.access_links FOR DELETE TO anon, authenticated USING (false);

CREATE POLICY "No client access to activity_log select" ON public.activity_log FOR SELECT TO anon, authenticated USING (false);
CREATE POLICY "No client access to activity_log insert" ON public.activity_log FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY "No client access to activity_log update" ON public.activity_log FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "No client access to activity_log delete" ON public.activity_log FOR DELETE TO anon, authenticated USING (false);

-- 2. Explicitly forbid role self-assignment on user_roles
CREATE POLICY "No client insert of roles" ON public.user_roles FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY "No client update of roles" ON public.user_roles FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "No client delete of roles" ON public.user_roles FOR DELETE TO anon, authenticated USING (false);

-- 3. Internal SECURITY DEFINER helpers must not be callable over the API.
--    They keep working inside RLS policies and other functions (executed as owner).
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.is_group_member(uuid, uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.is_group_teacher(uuid, uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.teaches_student(uuid, uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.grant_teacher_role() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;