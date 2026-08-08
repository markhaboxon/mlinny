ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS streak_freezes int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS coins int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS weekly_xp int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_xp int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS league text NOT NULL DEFAULT 'bronze',
  ADD COLUMN IF NOT EXISTS avatar_code text,
  ADD COLUMN IF NOT EXISTS theme_code text,
  ADD COLUMN IF NOT EXISTS last_freeze_used date,
  ADD COLUMN IF NOT EXISTS last_streak_reward int NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.coin_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount int NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.coin_transactions TO authenticated;
GRANT ALL ON public.coin_transactions TO service_role;
ALTER TABLE public.coin_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own coin history" ON public.coin_transactions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "no client coin insert" ON public.coin_transactions
  FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE INDEX IF NOT EXISTS coin_tx_user_idx ON public.coin_transactions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.shop_items (
  code text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('freeze','avatar','theme')),
  title text NOT NULL,
  description text,
  emoji text,
  price int NOT NULL CHECK (price >= 0),
  payload text,
  sort int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true
);
GRANT SELECT ON public.shop_items TO authenticated;
GRANT ALL ON public.shop_items TO service_role;
ALTER TABLE public.shop_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shop readable" ON public.shop_items
  FOR SELECT TO authenticated USING (active);

CREATE TABLE IF NOT EXISTS public.user_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_code text NOT NULL REFERENCES public.shop_items(code) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, item_code)
);
GRANT SELECT ON public.user_purchases TO authenticated;
GRANT ALL ON public.user_purchases TO service_role;
ALTER TABLE public.user_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own purchases" ON public.user_purchases
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "no client purchase insert" ON public.user_purchases
  FOR INSERT TO anon, authenticated WITH CHECK (false);

INSERT INTO public.shop_items (code, kind, title, description, emoji, price, payload, sort) VALUES
  ('freeze_1','freeze','Streak muzlatkich','Bir kunni o''tkazib yuborsangiz streak saqlanadi.','❄️',150,NULL,1),
  ('avatar_owl','avatar','Linny boyqush','Klassik Linny avatari.','🦉',0,'🦉',10),
  ('avatar_fox','avatar','Ayyor tulki','Zukko o''quvchilar uchun.','🦊',200,'🦊',11),
  ('avatar_dragon','avatar','Ajdaho','Streak ustasi uchun.','🐉',500,'🐉',12),
  ('avatar_astro','avatar','Kosmonavt','Yuqori ligalar uchun.','🚀',800,'🚀',13),
  ('theme_classic','theme','Klassik','Standart ko''rinish.','🎨',0,'classic',20),
  ('theme_ocean','theme','Okean','Moviy va tinch ranglar.','🌊',300,'ocean',21),
  ('theme_forest','theme','O''rmon','Yashil va yumshoq ranglar.','🌲',300,'forest',22),
  ('theme_sunset','theme','Shom','Issiq to''q sariq ranglar.','🌇',450,'sunset',23)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.league_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  league text NOT NULL,
  xp int NOT NULL DEFAULT 0,
  result text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, week_start)
);
GRANT SELECT ON public.league_history TO authenticated;
GRANT ALL ON public.league_history TO service_role;
ALTER TABLE public.league_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own league history" ON public.league_history
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.award_progress(_reason text, _xp int, _coins int)
RETURNS TABLE (coins int, weekly_xp int, total_xp int, league text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  add_xp int := GREATEST(0, LEAST(COALESCE(_xp, 0), 200));
  add_coins int := GREATEST(0, LEAST(COALESCE(_coins, 0), 200));
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  UPDATE public.profiles p SET
    coins = p.coins + add_coins,
    weekly_xp = p.weekly_xp + add_xp,
    total_xp = p.total_xp + add_xp
  WHERE p.user_id = uid;
  IF add_coins > 0 THEN
    INSERT INTO public.coin_transactions (user_id, amount, reason)
    VALUES (uid, add_coins, COALESCE(_reason, 'mashq'));
  END IF;
  RETURN QUERY
    SELECT p.coins, p.weekly_xp, p.total_xp, p.league
    FROM public.profiles p WHERE p.user_id = uid;
END $$;
REVOKE ALL ON FUNCTION public.award_progress(text, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.award_progress(text, int, int) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.buy_shop_item(_code text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  item public.shop_items%ROWTYPE;
  bal int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO item FROM public.shop_items WHERE code = _code AND active;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'Mahsulot topilmadi'); END IF;
  IF item.kind <> 'freeze' AND EXISTS (
    SELECT 1 FROM public.user_purchases WHERE user_id = uid AND item_code = _code
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Bu allaqachon sotib olingan');
  END IF;
  SELECT p.coins INTO bal FROM public.profiles p WHERE p.user_id = uid FOR UPDATE;
  IF bal IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Profil topilmadi'); END IF;
  IF bal < item.price THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Tangalar yetarli emas');
  END IF;
  UPDATE public.profiles SET coins = coins - item.price WHERE user_id = uid;
  INSERT INTO public.coin_transactions (user_id, amount, reason)
  VALUES (uid, -item.price, 'shop:' || item.code);
  IF item.kind = 'freeze' THEN
    UPDATE public.profiles SET streak_freezes = LEAST(streak_freezes + 1, 5) WHERE user_id = uid;
  ELSE
    INSERT INTO public.user_purchases (user_id, item_code) VALUES (uid, _code)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.buy_shop_item(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buy_shop_item(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.equip_shop_item(_code text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  item public.shop_items%ROWTYPE;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO item FROM public.shop_items WHERE code = _code AND active;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'Mahsulot topilmadi'); END IF;
  IF item.kind = 'freeze' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Bu buyum kiyiladigan emas');
  END IF;
  IF item.price > 0 AND NOT EXISTS (
    SELECT 1 FROM public.user_purchases WHERE user_id = uid AND item_code = _code
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Avval sotib oling');
  END IF;
  IF item.kind = 'avatar' THEN
    UPDATE public.profiles SET avatar_code = item.code WHERE user_id = uid;
  ELSE
    UPDATE public.profiles SET theme_code = item.code WHERE user_id = uid;
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.equip_shop_item(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.equip_shop_item(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.league_board()
RETURNS TABLE (user_id uuid, name text, avatar text, weekly_xp int, is_me boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.user_id,
         COALESCE(NULLIF(p.name, ''), 'O''quvchi') AS name,
         COALESCE(s.payload, '🦉') AS avatar,
         p.weekly_xp,
         p.user_id = auth.uid() AS is_me
  FROM public.profiles p
  LEFT JOIN public.shop_items s ON s.code = p.avatar_code
  WHERE auth.uid() IS NOT NULL
    AND p.league = (SELECT league FROM public.profiles WHERE user_id = auth.uid())
  ORDER BY p.weekly_xp DESC, p.user_id
  LIMIT 50;
$$;
REVOKE ALL ON FUNCTION public.league_board() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.league_board() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.run_league_rollover()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  wk date := date_trunc('week', now())::date;
  lg text;
  levels text[] := ARRAY['bronze','silver','gold','diamond'];
  i int;
BEGIN
  FOR i IN 1..array_length(levels, 1) LOOP
    lg := levels[i];
    WITH ranked AS (
      SELECT user_id, weekly_xp,
             percent_rank() OVER (ORDER BY weekly_xp DESC) AS pr,
             count(*) OVER () AS total
      FROM public.profiles WHERE league = lg
    ), decided AS (
      SELECT user_id, weekly_xp,
        CASE
          WHEN total < 5 THEN 'stay'
          WHEN pr < 0.2 AND i < array_length(levels, 1) THEN 'up'
          WHEN pr >= 0.8 AND i > 1 THEN 'down'
          ELSE 'stay'
        END AS result
      FROM ranked
    )
    INSERT INTO public.league_history (user_id, week_start, league, xp, result)
    SELECT user_id, wk, lg, weekly_xp, result FROM decided
    ON CONFLICT (user_id, week_start) DO UPDATE
      SET league = EXCLUDED.league, xp = EXCLUDED.xp, result = EXCLUDED.result;

    UPDATE public.profiles p SET league = levels[i + 1]
    FROM public.league_history h
    WHERE h.user_id = p.user_id AND h.week_start = wk
      AND h.league = lg AND h.result = 'up' AND i < array_length(levels, 1);

    UPDATE public.profiles p SET league = levels[i - 1]
    FROM public.league_history h
    WHERE h.user_id = p.user_id AND h.week_start = wk
      AND h.league = lg AND h.result = 'down' AND i > 1;
  END LOOP;
  UPDATE public.profiles SET weekly_xp = 0;
END $$;
REVOKE ALL ON FUNCTION public.run_league_rollover() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_league_rollover() TO service_role;

CREATE TABLE IF NOT EXISTS public.story_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  title text NOT NULL,
  description text,
  emoji text,
  level text NOT NULL DEFAULT 'orta' CHECK (level IN ('past','orta','yaxshi')),
  seed_prompt text NOT NULL,
  sort int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true
);
GRANT SELECT ON public.story_scenarios TO authenticated;
GRANT ALL ON public.story_scenarios TO service_role;
ALTER TABLE public.story_scenarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scenarios readable" ON public.story_scenarios
  FOR SELECT TO authenticated USING (active);

INSERT INTO public.story_scenarios (code, title, description, emoji, level, seed_prompt, sort) VALUES
  ('airport','Aeroportda adashib qolish','Reysingizni topolmayapsiz — xodimlar bilan gaplashing.','✈️','orta','The learner is lost at a big international airport and must find their gate before boarding closes.',1),
  ('interview','Ish suhbati','Ingliz tilida ish suhbatidan o''ting.','💼','yaxshi','The learner is in a job interview for a junior position at a tech company.',2),
  ('cafe','Kafeda buyurtma berish','Ovqat buyurtma qiling va hisobni to''lang.','☕','past','The learner is ordering food and drinks at a cosy cafe.',3),
  ('doctor','Shifokorda','O''zingizni yomon his qilyapsiz — shifokorga tushuntiring.','🩺','orta','The learner is at a doctor''s office describing symptoms.',4),
  ('hotel','Mehmonxonada','Xona band qilish va muammoni hal qilish.','🏨','orta','The learner is checking into a hotel and there is a problem with the reservation.',5),
  ('shopping','Do''konda xarid','Kiyim tanlang, o''lcham va narx so''rang.','🛍️','past','The learner is shopping for clothes and talking with a shop assistant.',6)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.story_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  scenario_code text NOT NULL REFERENCES public.story_scenarios(code) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','done')),
  turns int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.story_sessions TO authenticated;
GRANT ALL ON public.story_sessions TO service_role;
ALTER TABLE public.story_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own story sessions" ON public.story_sessions FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.story_turns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.story_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('ai','user')),
  text text NOT NULL,
  translation text,
  choices jsonb NOT NULL DEFAULT '[]'::jsonb,
  grammar_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.story_turns TO authenticated;
GRANT ALL ON public.story_turns TO service_role;
ALTER TABLE public.story_turns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own story turns" ON public.story_turns FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS story_turns_session_idx ON public.story_turns(session_id, created_at);

CREATE TABLE IF NOT EXISTS public.duel_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','active','done')),
  p1 uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  p2 uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  p1_name text,
  p2_name text,
  is_bot boolean NOT NULL DEFAULT false,
  questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  p1_score int NOT NULL DEFAULT 0,
  p2_score int NOT NULL DEFAULT 0,
  p1_done boolean NOT NULL DEFAULT false,
  p2_done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz
);
GRANT SELECT ON public.duel_matches TO authenticated;
GRANT ALL ON public.duel_matches TO service_role;
ALTER TABLE public.duel_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "duel participants read" ON public.duel_matches
  FOR SELECT TO authenticated USING (auth.uid() = p1 OR auth.uid() = p2);
CREATE INDEX IF NOT EXISTS duel_waiting_idx ON public.duel_matches(status, created_at);
ALTER TABLE public.duel_matches REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'duel_matches'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.duel_matches;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.duel_find_match(_name text, _questions jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  mid uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  UPDATE public.duel_matches m SET
    p2 = uid,
    p2_name = COALESCE(NULLIF(_name, ''), 'Raqib'),
    status = 'active',
    started_at = now()
  WHERE m.id = (
    SELECT d.id FROM public.duel_matches d
    WHERE d.status = 'waiting' AND d.p1 <> uid AND d.created_at > now() - interval '30 seconds'
    ORDER BY d.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING m.id INTO mid;
  IF mid IS NOT NULL THEN RETURN mid; END IF;
  INSERT INTO public.duel_matches (p1, p1_name, questions)
  VALUES (uid, COALESCE(NULLIF(_name, ''), 'Men'), COALESCE(_questions, '[]'::jsonb))
  RETURNING id INTO mid;
  RETURN mid;
END $$;
REVOKE ALL ON FUNCTION public.duel_find_match(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.duel_find_match(text, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.duel_attach_bot(_match uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  n int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  UPDATE public.duel_matches SET
    status = 'active', is_bot = true, p2_name = 'Linny Bot', started_at = now()
  WHERE id = _match AND p1 = uid AND status = 'waiting';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END $$;
REVOKE ALL ON FUNCTION public.duel_attach_bot(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.duel_attach_bot(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.duel_report(_match uuid, _score int, _finished boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  m public.duel_matches%ROWTYPE;
  sc int := GREATEST(0, LEAST(COALESCE(_score, 0), 2000));
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO m FROM public.duel_matches WHERE id = _match FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'Duel topilmadi'); END IF;
  IF uid <> m.p1 AND uid IS DISTINCT FROM m.p2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Ruxsat yo''q');
  END IF;
  IF uid = m.p1 THEN
    UPDATE public.duel_matches SET p1_score = sc, p1_done = COALESCE(_finished, false) WHERE id = _match;
  ELSE
    UPDATE public.duel_matches SET p2_score = sc, p2_done = COALESCE(_finished, false) WHERE id = _match;
  END IF;
  UPDATE public.duel_matches SET status = 'done'
  WHERE id = _match AND p1_done AND (p2_done OR is_bot);
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.duel_report(uuid, int, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.duel_report(uuid, int, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.duel_bot_score(_match uuid, _score int, _finished boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  UPDATE public.duel_matches SET
    p2_score = GREATEST(0, LEAST(COALESCE(_score, 0), 2000)),
    p2_done = COALESCE(_finished, false)
  WHERE id = _match AND p1 = uid AND is_bot;
  UPDATE public.duel_matches SET status = 'done'
  WHERE id = _match AND p1 = uid AND is_bot AND p1_done AND p2_done;
END $$;
REVOKE ALL ON FUNCTION public.duel_bot_score(uuid, int, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.duel_bot_score(uuid, int, boolean) TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id uuid REFERENCES public.groups(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('essay','speaking')),
  prompt text,
  content text NOT NULL,
  ai_score int,
  ai_feedback jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.submissions TO authenticated;
GRANT ALL ON public.submissions TO service_role;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own submissions read" ON public.submissions
  FOR SELECT TO authenticated
  USING (auth.uid() = student_id OR public.teaches_student(auth.uid(), student_id));
CREATE POLICY "own submissions insert" ON public.submissions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = student_id);
CREATE INDEX IF NOT EXISTS submissions_student_idx ON public.submissions(student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS submissions_group_idx ON public.submissions(group_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ai_usage_daily (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day date NOT NULL DEFAULT CURRENT_DATE,
  kind text NOT NULL,
  used int NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day, kind)
);
GRANT SELECT ON public.ai_usage_daily TO authenticated;
GRANT ALL ON public.ai_usage_daily TO service_role;
ALTER TABLE public.ai_usage_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ai usage" ON public.ai_usage_daily
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "no client ai usage write" ON public.ai_usage_daily
  FOR INSERT TO anon, authenticated WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.consume_ai_quota(_kind text, _limit int)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  cur int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  INSERT INTO public.ai_usage_daily (user_id, day, kind, used)
  VALUES (uid, CURRENT_DATE, _kind, 0)
  ON CONFLICT (user_id, day, kind) DO NOTHING;
  SELECT used INTO cur FROM public.ai_usage_daily
  WHERE user_id = uid AND day = CURRENT_DATE AND kind = _kind FOR UPDATE;
  IF cur >= GREATEST(COALESCE(_limit, 0), 0) THEN
    RETURN jsonb_build_object('ok', false, 'used', cur, 'limit', _limit);
  END IF;
  UPDATE public.ai_usage_daily SET used = used + 1
  WHERE user_id = uid AND day = CURRENT_DATE AND kind = _kind;
  RETURN jsonb_build_object('ok', true, 'used', cur + 1, 'limit', _limit);
END $$;
REVOKE ALL ON FUNCTION public.consume_ai_quota(text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_ai_quota(text, int) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.touch_daily_progress()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  today date := CURRENT_DATE;
  prev date;
  cur_streak int;
  freezes int;
  used_freeze boolean := false;
  best int;
  reward int := 0;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  INSERT INTO public.daily_progress (user_id, day) VALUES (uid, today)
  ON CONFLICT (user_id, day) DO NOTHING;

  SELECT p.last_visit, p.streak, p.streak_freezes, p.best_streak, p.last_streak_reward
    INTO prev, cur_streak, freezes, best, reward
  FROM public.profiles p WHERE p.user_id = uid FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('streak', 0); END IF;

  cur_streak := COALESCE(cur_streak, 0);
  freezes := COALESCE(freezes, 0);

  IF prev IS NULL THEN
    cur_streak := 1;
  ELSIF prev = today THEN
    NULL;
  ELSIF prev = today - 1 THEN
    cur_streak := cur_streak + 1;
  ELSIF prev < today - 1 AND freezes > 0 THEN
    freezes := freezes - 1;
    used_freeze := true;
    cur_streak := cur_streak + 1;
  ELSE
    cur_streak := 1;
  END IF;

  best := GREATEST(COALESCE(best, 0), cur_streak);

  UPDATE public.profiles SET
    streak = cur_streak,
    best_streak = best,
    streak_freezes = freezes,
    last_visit = today,
    last_freeze_used = CASE WHEN used_freeze THEN today ELSE last_freeze_used END
  WHERE user_id = uid;

  IF cur_streak > 0 AND cur_streak % 7 = 0 AND COALESCE(reward, 0) < cur_streak THEN
    UPDATE public.profiles SET coins = coins + 50, last_streak_reward = cur_streak
    WHERE user_id = uid;
    INSERT INTO public.coin_transactions (user_id, amount, reason)
    VALUES (uid, 50, cur_streak || ' kunlik streak');
  END IF;

  RETURN jsonb_build_object(
    'streak', cur_streak,
    'freezes', freezes,
    'usedFreeze', used_freeze,
    'bestStreak', best
  );
END $$;
REVOKE ALL ON FUNCTION public.touch_daily_progress() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.touch_daily_progress() TO authenticated, service_role;