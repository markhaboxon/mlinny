CREATE TABLE public.srs_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  word text NOT NULL,
  translation text,
  example text,
  interval_days integer NOT NULL DEFAULT 0,
  ease numeric NOT NULL DEFAULT 2.5,
  reps integer NOT NULL DEFAULT 0,
  lapses integer NOT NULL DEFAULT 0,
  due_date date NOT NULL DEFAULT CURRENT_DATE,
  last_reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, word)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.srs_cards TO authenticated;
GRANT ALL ON public.srs_cards TO service_role;

ALTER TABLE public.srs_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own srs cards" ON public.srs_cards
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX srs_cards_due_idx ON public.srs_cards (user_id, due_date);

CREATE TABLE public.pronunciation_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target text NOT NULL,
  heard text,
  score integer NOT NULL DEFAULT 0,
  feedback jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.pronunciation_attempts TO authenticated;
GRANT ALL ON public.pronunciation_attempts TO service_role;

ALTER TABLE public.pronunciation_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own pronunciation attempts read" ON public.pronunciation_attempts
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own pronunciation attempts insert" ON public.pronunciation_attempts
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- SM-2 asosidagi takrorlash: kartani baholash va keyingi muddatni hisoblash.
CREATE OR REPLACE FUNCTION public.srs_review(_card uuid, _quality integer)
RETURNS TABLE(id uuid, due_date date, interval_days integer, ease numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.srs_cards%ROWTYPE;
  new_ease numeric;
  new_interval integer;
BEGIN
  IF _quality < 0 OR _quality > 5 THEN
    RAISE EXCEPTION 'quality 0..5 bo''lishi kerak';
  END IF;

  SELECT * INTO c FROM public.srs_cards s WHERE s.id = _card AND s.user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Karta topilmadi';
  END IF;

  new_ease := GREATEST(1.3, c.ease + (0.1 - (5 - _quality) * (0.08 + (5 - _quality) * 0.02)));

  IF _quality < 3 THEN
    new_interval := 1;
    UPDATE public.srs_cards SET lapses = lapses + 1 WHERE public.srs_cards.id = c.id;
  ELSIF c.reps = 0 THEN
    new_interval := 1;
  ELSIF c.reps = 1 THEN
    new_interval := 3;
  ELSE
    new_interval := GREATEST(1, ROUND(GREATEST(c.interval_days, 1) * new_ease))::integer;
  END IF;

  new_interval := LEAST(new_interval, 365);

  UPDATE public.srs_cards s
     SET ease = new_ease,
         interval_days = new_interval,
         reps = CASE WHEN _quality < 3 THEN 0 ELSE s.reps + 1 END,
         due_date = CURRENT_DATE + new_interval,
         last_reviewed_at = now()
   WHERE s.id = c.id
   RETURNING s.id, s.due_date, s.interval_days, s.ease
   INTO id, due_date, interval_days, ease;

  RETURN NEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.srs_review(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.srs_review(uuid, integer) TO authenticated;