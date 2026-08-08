DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('student','teacher','school_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;
CREATE TABLE IF NOT EXISTS public.groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  join_code text NOT NULL UNIQUE,
  lesson_days smallint[] NOT NULL DEFAULT '{}',
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.groups TO authenticated;
GRANT ALL ON public.groups TO service_role;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public.group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id)
);
CREATE INDEX IF NOT EXISTS group_members_group_idx ON public.group_members(group_id);
GRANT SELECT, DELETE ON public.group_members TO authenticated;
GRANT ALL ON public.group_members TO service_role;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.is_group_teacher(_uid uuid, _gid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.groups g WHERE g.id = _gid AND g.teacher_id = _uid);
$$;
CREATE OR REPLACE FUNCTION public.is_group_member(_uid uuid, _gid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.group_members m WHERE m.group_id = _gid AND m.student_id = _uid);
$$;
CREATE OR REPLACE FUNCTION public.teaches_student(_uid uuid, _sid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members m
    JOIN public.groups g ON g.id = m.group_id
    WHERE m.student_id = _sid AND g.teacher_id = _uid
  );
$$;
CREATE POLICY "teacher manages own groups" ON public.groups FOR ALL TO authenticated
  USING (auth.uid() = teacher_id) WITH CHECK (auth.uid() = teacher_id);
CREATE POLICY "member reads own group" ON public.groups FOR SELECT TO authenticated
  USING (public.is_group_member(auth.uid(), id));
CREATE POLICY "read group members" ON public.group_members FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR public.is_group_teacher(auth.uid(), group_id));
CREATE POLICY "leave or remove member" ON public.group_members FOR DELETE TO authenticated
  USING (student_id = auth.uid() OR public.is_group_teacher(auth.uid(), group_id));
CREATE OR REPLACE FUNCTION public.grant_teacher_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.teacher_id, 'teacher')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS groups_grant_teacher ON public.groups;
CREATE TRIGGER groups_grant_teacher AFTER INSERT ON public.groups
  FOR EACH ROW EXECUTE FUNCTION public.grant_teacher_role();
DROP TRIGGER IF EXISTS groups_updated_at ON public.groups;
CREATE TRIGGER groups_updated_at BEFORE UPDATE ON public.groups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TABLE IF NOT EXISTS public.assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_student_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  topic text,
  level text NOT NULL DEFAULT 'orta',
  note text,
  due_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assignments_group_idx ON public.assignments(group_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assignments TO authenticated;
GRANT ALL ON public.assignments TO service_role;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "teacher manages assignments" ON public.assignments FOR ALL TO authenticated
  USING (auth.uid() = teacher_id) WITH CHECK (auth.uid() = teacher_id AND public.is_group_teacher(auth.uid(), group_id));
CREATE POLICY "student reads assignments" ON public.assignments FOR SELECT TO authenticated
  USING (public.is_group_member(auth.uid(), group_id) AND (target_student_id IS NULL OR target_student_id = auth.uid()));
CREATE TABLE IF NOT EXISTS public.assignment_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  student_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  completed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, student_id)
);
GRANT SELECT, INSERT, DELETE ON public.assignment_completions TO authenticated;
GRANT ALL ON public.assignment_completions TO service_role;
ALTER TABLE public.assignment_completions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "student completes own" ON public.assignment_completions FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid());
CREATE POLICY "read completions" ON public.assignment_completions FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR public.teaches_student(auth.uid(), student_id));
CREATE POLICY "undo own completion" ON public.assignment_completions FOR DELETE TO authenticated
  USING (student_id = auth.uid());
CREATE TABLE IF NOT EXISTS public.teacher_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id uuid REFERENCES public.groups(id) ON DELETE CASCADE,
  title text NOT NULL,
  kind text NOT NULL DEFAULT 'words',
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS teacher_materials_group_idx ON public.teacher_materials(group_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teacher_materials TO authenticated;
GRANT ALL ON public.teacher_materials TO service_role;
ALTER TABLE public.teacher_materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "teacher manages materials" ON public.teacher_materials FOR ALL TO authenticated
  USING (auth.uid() = teacher_id) WITH CHECK (auth.uid() = teacher_id);
CREATE POLICY "student reads group materials" ON public.teacher_materials FOR SELECT TO authenticated
  USING (group_id IS NOT NULL AND public.is_group_member(auth.uid(), group_id));
CREATE TABLE IF NOT EXISTS public.curriculum_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic text NOT NULL,
  planned_date date,
  taught_at date,
  notes text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS curriculum_group_idx ON public.curriculum_entries(group_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.curriculum_entries TO authenticated;
GRANT ALL ON public.curriculum_entries TO service_role;
ALTER TABLE public.curriculum_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "teacher manages curriculum" ON public.curriculum_entries FOR ALL TO authenticated
  USING (auth.uid() = teacher_id) WITH CHECK (auth.uid() = teacher_id AND public.is_group_teacher(auth.uid(), group_id));
CREATE POLICY "student reads curriculum" ON public.curriculum_entries FOR SELECT TO authenticated
  USING (public.is_group_member(auth.uid(), group_id));
CREATE OR REPLACE FUNCTION public.create_group(_name text, _lesson_days smallint[] DEFAULT '{}')
RETURNS TABLE (id uuid, name text, join_code text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _code text; _uid uuid := auth.uid(); _try int := 0;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF coalesce(btrim(_name),'') = '' THEN RAISE EXCEPTION 'Guruh nomi bo''sh bo''lmasligi kerak'; END IF;
  LOOP
    _try := _try + 1;
    _code := lpad((floor(random()*900000)+100000)::int::text, 6, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.groups g WHERE g.join_code = _code) OR _try > 50;
  END LOOP;
  RETURN QUERY
  INSERT INTO public.groups (teacher_id, name, join_code, lesson_days)
  VALUES (_uid, btrim(_name), _code, coalesce(_lesson_days,'{}'))
  RETURNING groups.id, groups.name, groups.join_code;
END $$;
CREATE OR REPLACE FUNCTION public.join_group_by_code(_code text)
RETURNS TABLE (group_id uuid, group_name text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _g public.groups%ROWTYPE; _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  SELECT * INTO _g FROM public.groups WHERE join_code = btrim(_code) AND archived = false;
  IF _g.id IS NULL THEN RAISE EXCEPTION 'Bunday kodli guruh topilmadi'; END IF;
  IF _g.teacher_id = _uid THEN RAISE EXCEPTION 'O''z guruhingizga o''quvchi sifatida qo''shila olmaysiz'; END IF;
  IF EXISTS (SELECT 1 FROM public.group_members WHERE student_id = _uid) THEN
    RAISE EXCEPTION 'Siz allaqachon boshqa guruhdasiz. Avval undan chiqing.';
  END IF;
  INSERT INTO public.group_members (group_id, student_id) VALUES (_g.id, _uid);
  INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'student') ON CONFLICT DO NOTHING;
  RETURN QUERY SELECT _g.id, _g.name;
END $$;
CREATE OR REPLACE FUNCTION public.my_group()
RETURNS TABLE (group_id uuid, group_name text, teacher_name text, lesson_days smallint[], joined_at timestamptz, members_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT g.id, g.name, p.name, g.lesson_days, m.joined_at,
         (SELECT count(*) FROM public.group_members x WHERE x.group_id = g.id)
  FROM public.group_members m
  JOIN public.groups g ON g.id = m.group_id
  LEFT JOIN public.profiles p ON p.user_id = g.teacher_id
  WHERE m.student_id = auth.uid();
$$;
CREATE OR REPLACE FUNCTION public.teacher_group_students(_gid uuid)
RETURNS TABLE (
  student_id uuid, name text, level_chosen text, streak int, best_streak int, last_visit date,
  learned_count bigint, mistakes_count bigint, accuracy numeric,
  active_7 bigint, active_30 bigint, self_days_14 bigint,
  mistakes_7 bigint, mistakes_prev_7 bigint,
  assignments_total bigint, assignments_done bigint, joined_at timestamptz
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_group_teacher(auth.uid(), _gid) THEN RAISE EXCEPTION 'Ruxsat yo''q'; END IF;
  RETURN QUERY
  SELECT m.student_id,
    coalesce(p.name, 'Ismsiz'),
    p.level_chosen,
    coalesce(p.streak,0), coalesce(p.best_streak,0), p.last_visit,
    (SELECT count(*) FROM public.learned_words l WHERE l.user_id = m.student_id),
    (SELECT count(*) FROM public.mistakes x WHERE x.user_id = m.student_id),
    CASE WHEN (SELECT count(*) FROM public.learned_words l WHERE l.user_id = m.student_id)
            + (SELECT count(*) FROM public.mistakes x WHERE x.user_id = m.student_id) = 0 THEN 0
         ELSE round(100.0 * (SELECT count(*) FROM public.learned_words l WHERE l.user_id = m.student_id)
              / ((SELECT count(*) FROM public.learned_words l WHERE l.user_id = m.student_id)
               + (SELECT count(*) FROM public.mistakes x WHERE x.user_id = m.student_id)), 0) END,
    (SELECT count(*) FROM public.daily_progress d WHERE d.user_id = m.student_id AND d.day > current_date - 7),
    (SELECT count(*) FROM public.daily_progress d WHERE d.user_id = m.student_id AND d.day > current_date - 30),
    (SELECT count(*) FROM public.daily_progress d, public.groups g2
      WHERE g2.id = _gid AND d.user_id = m.student_id AND d.day > current_date - 14
        AND NOT (extract(dow from d.day)::smallint = ANY (g2.lesson_days))),
    (SELECT count(*) FROM public.mistakes x WHERE x.user_id = m.student_id AND x.created_at > now() - interval '7 days'),
    (SELECT count(*) FROM public.mistakes x WHERE x.user_id = m.student_id
       AND x.created_at > now() - interval '14 days' AND x.created_at <= now() - interval '7 days'),
    (SELECT count(*) FROM public.assignments a WHERE a.group_id = _gid AND (a.target_student_id IS NULL OR a.target_student_id = m.student_id)),
    (SELECT count(*) FROM public.assignment_completions c JOIN public.assignments a ON a.id = c.assignment_id
       WHERE a.group_id = _gid AND c.student_id = m.student_id),
    m.joined_at
  FROM public.group_members m
  LEFT JOIN public.profiles p ON p.user_id = m.student_id
  WHERE m.group_id = _gid;
END $$;
CREATE OR REPLACE FUNCTION public.teacher_group_summary(_gid uuid)
RETURNS TABLE (
  total_students bigint, active_today bigint, active_7 bigint,
  avg_streak numeric, avg_accuracy numeric, top_mistake_tag text, at_risk bigint
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_group_teacher(auth.uid(), _gid) THEN RAISE EXCEPTION 'Ruxsat yo''q'; END IF;
  RETURN QUERY
  WITH s AS (SELECT * FROM public.teacher_group_students(_gid))
  SELECT (SELECT count(*) FROM s),
         (SELECT count(*) FROM s WHERE last_visit = current_date),
         (SELECT count(*) FROM s WHERE active_7 > 0),
         (SELECT coalesce(round(avg(streak),1),0) FROM s),
         (SELECT coalesce(round(avg(accuracy),0),0) FROM s),
         (SELECT x.tag FROM public.mistakes x
            WHERE x.user_id IN (SELECT student_id FROM s) AND x.tag IS NOT NULL
            GROUP BY x.tag ORDER BY count(*) DESC LIMIT 1),
         (SELECT count(*) FROM s WHERE last_visit IS NULL OR last_visit < current_date - 3);
END $$;
CREATE OR REPLACE FUNCTION public.teacher_group_top_mistakes(_gid uuid, _limit int DEFAULT 8)
RETURNS TABLE (tag text, cnt bigint) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_group_teacher(auth.uid(), _gid) THEN RAISE EXCEPTION 'Ruxsat yo''q'; END IF;
  RETURN QUERY
  SELECT coalesce(x.tag,'Boshqa'), count(*)
  FROM public.mistakes x
  WHERE x.user_id IN (SELECT student_id FROM public.group_members WHERE group_id = _gid)
  GROUP BY 1 ORDER BY 2 DESC LIMIT _limit;
END $$;
CREATE OR REPLACE FUNCTION public.teacher_group_activity(_gid uuid, _days int DEFAULT 30)
RETURNS TABLE (day date, active bigint, mistakes bigint) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_group_teacher(auth.uid(), _gid) THEN RAISE EXCEPTION 'Ruxsat yo''q'; END IF;
  RETURN QUERY
  SELECT d::date,
    (SELECT count(*) FROM public.daily_progress p
      WHERE p.day = d::date AND p.user_id IN (SELECT student_id FROM public.group_members WHERE group_id = _gid)),
    (SELECT count(*) FROM public.mistakes x
      WHERE x.created_at::date = d::date AND x.user_id IN (SELECT student_id FROM public.group_members WHERE group_id = _gid))
  FROM generate_series(current_date - (_days - 1), current_date, interval '1 day') d
  ORDER BY 1;
END $$;