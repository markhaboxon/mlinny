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