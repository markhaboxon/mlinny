/**
 * BO'LIM F — PvP duellar.
 *
 * Savollar serverda AI orqali tuziladi va bazaga yoziladi; ball hisobi faqat
 * `duel_report` / `duel_bot_score` (SECURITY DEFINER) funksiyalari orqali
 * o'zgaradi, shuning uchun brauzerdan natijani soxtalashtirib bo'lmaydi.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText, Output } from "ai";
import { z } from "zod";
import { getGateway } from "./ai-gateway.server";
import { AI_MODEL } from "./ai-model";

export type DuelQuestion = {
  q: string;
  choices: string[];
  answerIndex: number;
};

export type DuelMatch = {
  id: string;
  status: string;
  isBot: boolean;
  questions: DuelQuestion[];
  p1: string;
  p2: string | null;
  p1Name: string | null;
  p2Name: string | null;
  p1Score: number;
  p2Score: number;
  p1Done: boolean;
  p2Done: boolean;
  meIsP1: boolean;
};

const DuelSchema = z.object({
  items: z
    .array(
      z.object({
        q: z.string(),
        choices: z.array(z.string()).length(4),
        answerIndex: z.number().int().min(0).max(3),
      }),
    )
    .min(1),
});

function shape(row: Record<string, unknown>, userId: string): DuelMatch {
  const raw = row.questions;
  const questions = Array.isArray(raw) ? (raw as DuelQuestion[]) : [];
  return {
    id: String(row.id),
    status: String(row.status ?? "waiting"),
    isBot: Boolean(row.is_bot),
    questions,
    p1: String(row.p1),
    p2: (row.p2 as string | null) ?? null,
    p1Name: (row.p1_name as string | null) ?? null,
    p2Name: (row.p2_name as string | null) ?? null,
    p1Score: Number(row.p1_score ?? 0),
    p2Score: Number(row.p2_score ?? 0),
    p1Done: Boolean(row.p1_done),
    p2Done: Boolean(row.p2_done),
    meIsP1: String(row.p1) === userId,
  };
}

/** Raqib qidiradi; ochiq navbat bo'lsa qo'shiladi, bo'lmasa yangi o'yin ochadi. */
export const findDuel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        name: z.string().min(1).max(40),
        level: z.enum(["past", "orta", "yaxshi"]).default("orta"),
        topic: z.string().min(1).max(60).default("umumiy"),
        count: z.number().int().min(3).max(10).default(6),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<DuelMatch> => {
    const gw = getGateway(context.userId);
    const { output } = await generateText({
      model: gw(AI_MODEL),
      output: Output.object({ schema: DuelSchema }),
      prompt: `Sen ingliz tili muallimisan. Daraja: ${data.level}. Mavzu: "${data.topic}".
${data.count} ta juda qisqa ko'p variantli savol tuz (lug'at yoki grammatika), tez o'ynaladigan duel uchun.
Har biri: "q" (o'zbekcha yoki inglizcha qisqa savol), "choices" (4 ta variant), "answerIndex" (0-3).
Faqat JSON: {"items":[...]}`,
    });

    const { data: matchId, error } = await context.supabase.rpc("duel_find_match", {
      _name: data.name.trim(),
      _questions: output.items,
    });
    if (error) throw error;

    const { data: row, error: readErr } = await context.supabase
      .from("duel_matches")
      .select("*")
      .eq("id", matchId as string)
      .maybeSingle();
    if (readErr) throw readErr;
    if (!row) throw new Error("Duel topilmadi");
    return shape(row as Record<string, unknown>, context.userId);
  });

/** O'yin holatini o'qish (realtime obunaga qo'shimcha zaxira sifatida). */
export const getDuel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ matchId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<DuelMatch | null> => {
    const { data: row, error } = await context.supabase
      .from("duel_matches")
      .select("*")
      .eq("id", data.matchId)
      .maybeSingle();
    if (error) throw error;
    return row ? shape(row as Record<string, unknown>, context.userId) : null;
  });

/** Raqib topilmasa AI-bot biriktiriladi. */
export const attachBot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ matchId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: ok, error } = await context.supabase.rpc("duel_attach_bot", { _match: data.matchId });
    if (error) throw error;
    return { attached: Boolean(ok) };
  });

/** Bot javob berdi — ballini bazaviy funksiya orqali yangilash. */
export const botScore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        matchId: z.string().uuid(),
        score: z.number().int().min(0).max(50),
        finished: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("duel_bot_score", {
      _match: data.matchId,
      _score: data.score,
      _finished: data.finished,
    });
    if (error) throw error;
    return { ok: true };
  });

/** O'z natijasini yuborish. Baza g'olibni aniqlaydi va mukofotni beradi. */
export const reportDuel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        matchId: z.string().uuid(),
        score: z.number().int().min(0).max(50),
        finished: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("duel_report", {
      _match: data.matchId,
      _score: data.score,
      _finished: data.finished,
    });
    if (error) throw error;
    const r = (res ?? {}) as Record<string, unknown>;
    return {
      status: String(r.status ?? "playing"),
      result: (r.result as string | null) ?? null,
      coins: Number(r.coins ?? 0),
      xp: Number(r.xp ?? 0),
    };
  });
