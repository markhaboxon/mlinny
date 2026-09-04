/**
 * BO'LIM S — Spaced Repetition (SM-2) takrorlash tizimi.
 *
 * O'quvchi o'rgangan so'zlari `srs_cards` jadvaliga ko'chiriladi va ilmiy
 * isbotlangan interval (1 → 3 → ease × interval) bo'yicha takrorlashga
 * chiqariladi. Barcha yozuvlar RLS orqali faqat egasiga tegishli.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type SrsCard = {
  id: string;
  word: string;
  translation: string | null;
  example: string | null;
  interval: number;
  reps: number;
  dueDate: string;
};

export type SrsStats = {
  total: number;
  due: number;
  learned: number;
  reviewedToday: number;
};

function shape(r: Record<string, unknown>): SrsCard {
  return {
    id: String(r.id),
    word: String(r.word),
    translation: (r.translation as string | null) ?? null,
    example: (r.example as string | null) ?? null,
    interval: Number(r.interval_days ?? 0),
    reps: Number(r.reps ?? 0),
    dueDate: String(r.due_date),
  };
}

/** O'rganilgan so'zlarni SRS bazasiga ko'chiradi (dublikatlar tashlanadi). */
async function syncFromVocab(
  supabase: import("@supabase/supabase-js").SupabaseClient<
    import("@/integrations/supabase/types").Database
  >,
  userId: string,
) {
  const [{ data: learned }, { data: vocab }] = await Promise.all([
    supabase.from("learned_words").select("word, translation").limit(300),
    supabase
      .from("vocab_words")
      .select("word, translation, example")
      .eq("status", "learned")
      .limit(300),
  ]);

  const map = new Map<string, { word: string; translation: string | null; example: string | null }>();
  for (const r of learned ?? []) {
    const w = String(r.word).trim().toLowerCase();
    if (w) map.set(w, { word: String(r.word).trim(), translation: r.translation ?? null, example: null });
  }
  for (const r of vocab ?? []) {
    const w = String(r.word).trim().toLowerCase();
    if (!w) continue;
    map.set(w, {
      word: String(r.word).trim(),
      translation: r.translation ?? null,
      example: (r as { example?: string | null }).example ?? null,
    });
  }
  if (map.size === 0) return;

  const rows = [...map.values()].map((v) => ({
    user_id: userId,
    word: v.word,
    translation: v.translation,
    example: v.example,
  }));
  await supabase.from("srs_cards").upsert(rows, { onConflict: "user_id,word", ignoreDuplicates: true });
}

/** Bugun takrorlash kerak bo'lgan kartalar + umumiy statistika. */
export const getDueCards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ limit: z.number().int().min(1).max(50).default(20) }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await syncFromVocab(supabase, userId);

    const today = new Date().toISOString().slice(0, 10);
    const [{ data: due }, { count: total }, { count: learnedCount }, { count: reviewedToday }] =
      await Promise.all([
        supabase
          .from("srs_cards")
          .select("id, word, translation, example, interval_days, reps, due_date")
          .lte("due_date", today)
          .order("due_date", { ascending: true })
          .limit(data.limit),
        supabase.from("srs_cards").select("id", { count: "exact", head: true }),
        supabase.from("srs_cards").select("id", { count: "exact", head: true }).gte("interval_days", 21),
        supabase
          .from("srs_cards")
          .select("id", { count: "exact", head: true })
          .gte("last_reviewed_at", `${today}T00:00:00Z`),
      ]);

    const cards = (due ?? []).map((r) => shape(r as Record<string, unknown>));
    const stats: SrsStats = {
      total: total ?? 0,
      due: cards.length,
      learned: learnedCount ?? 0,
      reviewedToday: reviewedToday ?? 0,
    };
    return { cards, stats };
  });

/** Kartani baholash (0-5). Baza SM-2 bo'yicha keyingi muddatni hisoblaydi. */
export const reviewCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), quality: z.number().int().min(0).max(5) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("srs_review", {
      _card: data.id,
      _quality: data.quality,
    });
    if (error) throw new Error(error.message);
    const row = (Array.isArray(rows) ? rows[0] : rows) as Record<string, unknown> | null;

    if (data.quality >= 3) {
      try {
        await context.supabase.rpc("award_progress", { _reason: "srs_review", _xp: 2, _coins: 0 });
      } catch {
        /* mukofot bo'lmasa ham takrorlash saqlanadi */
      }
    }

    return {
      dueDate: row ? String(row.due_date) : null,
      interval: row ? Number(row.interval_days ?? 0) : 0,
    };
  });

/** Qo'lda yangi so'z qo'shish. */
export const addCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        word: z.string().min(1).max(60),
        translation: z.string().max(120).optional(),
        example: z.string().max(300).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("srs_cards").upsert(
      {
        user_id: context.userId,
        word: data.word.trim(),
        translation: data.translation?.trim() || null,
        example: data.example?.trim() || null,
      },
      { onConflict: "user_id,word", ignoreDuplicates: true },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
