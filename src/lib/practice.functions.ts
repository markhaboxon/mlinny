/**
 * BO'LIM D/G/T — Diktant, Grammatika darslari va AI suhbatdosh ustoz.
 *
 * Uchala mashq ham bitta AI shlyuzidan foydalanadi va kunlik limit
 * `consume_ai_quota` orqali nazorat qilinadi.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText, Output } from "ai";
import { z } from "zod";
import { getGateway } from "./ai-gateway.server";
import { AI_MODEL } from "./ai-model";

const LEVEL = z.enum(["past", "orta", "yaxshi"]).default("orta");

async function quota(kind: string, limit: number) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.rpc("consume_ai_quota", { _kind: kind, _limit: limit });
  const row = data as Record<string, unknown> | null;
  if (row?.ok === false || row?.allowed === false) {
    throw new Error("Bugungi limit tugadi. Ertaga davom eting.");
  }
}

/* ------------------------------------------------------------------ *
 * 1) Diktant — eshitib yozish
 * ------------------------------------------------------------------ */

export const dictationBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ level: LEVEL, topic: z.string().max(60).optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const gw = getGateway(context.userId);
    const Schema = z.object({
      items: z.array(z.object({ text: z.string(), hint: z.string() })).max(10),
    });
    try {
      const { output } = await generateText({
        model: gw(AI_MODEL),
        output: Output.object({ schema: Schema }),
        prompt: `Ingliz tili diktant mashqi uchun 8 ta jumla yoz. Daraja: ${data.level}.${
          data.topic ? ` Mavzu: ${data.topic}.` : ""
        }
Har biri 5-12 so'z, tabiiy kundalik ingliz tilida.
"hint" — o'zbekcha tarjima.
Faqat JSON: {"items":[{"text":"...","hint":"..."}]}`,
      });
      return output.items;
    } catch {
      return [
        { text: "I usually wake up at seven in the morning.", hint: "Men odatda ertalab yettida uyg'onaman." },
        { text: "She is reading an interesting book now.", hint: "U hozir qiziqarli kitob o'qiyapti." },
        { text: "We went to the market yesterday evening.", hint: "Biz kecha kechqurun bozorga bordik." },
        { text: "My brother wants to become a doctor.", hint: "Akam shifokor bo'lmoqchi." },
        { text: "They have lived here for ten years.", hint: "Ular bu yerda o'n yildan beri yashashadi." },
        { text: "Could you please repeat that question?", hint: "Iltimos, savolni takrorlay olasizmi?" },
        { text: "The weather was very cold last week.", hint: "O'tgan hafta havo juda sovuq edi." },
        { text: "I will call you when I arrive home.", hint: "Uyga yetganimda sizga qo'ng'iroq qilaman." },
      ];
    }
  });

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Yozilgan matnni maqsad bilan so'zma-so'z solishtiradi (AI'siz, tez). */
export const gradeDictation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ target: z.string().min(1).max(300), typed: z.string().max(300) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const t = norm(data.target).split(" ").filter(Boolean);
    const y = norm(data.typed).split(" ").filter(Boolean);
    const diff: { expected: string; got: string | null }[] = [];
    let correct = 0;
    for (let i = 0; i < t.length; i++) {
      const got = y[i] ?? null;
      if (got === t[i]) correct++;
      else diff.push({ expected: t[i]!, got });
    }
    const score = t.length ? Math.round((correct / t.length) * 100) : 0;

    if (score >= 70) {
      try {
        await context.supabase.rpc("award_progress", { _reason: "diktant", _xp: 6, _coins: 1 });
      } catch {
        /* mukofotsiz ham davom etadi */
      }
    }
    if (score < 100) {
      try {
        await context.supabase.from("mistakes").insert({
          user_id: context.userId,
          question: data.target,
          wrong_answer: data.typed.slice(0, 300),
          correct_answer: data.target,
          tag: "Diktant",
          skill: "listening",
        });
      } catch {
        /* ignore */
      }
    }
    return { score, correct, total: t.length, diff: diff.slice(0, 12) };
  });

/* ------------------------------------------------------------------ *
 * 2) Grammatika darslari
 * ------------------------------------------------------------------ */

export const GRAMMAR_TOPICS = [
  "Present Simple",
  "Present Continuous",
  "Past Simple",
  "Past Continuous",
  "Present Perfect",
  "Future (will / going to)",
  "Modal verbs (can, must, should)",
  "Articles (a / an / the)",
  "Prepositions of time and place",
  "Comparative and Superlative",
  "Conditionals (0, 1, 2)",
  "Passive Voice",
  "Reported Speech",
  "Gerund va Infinitive",
  "Phrasal verbs",
] as const;

const LessonSchema = z.object({
  title: z.string(),
  explanation: z.string(),
  rules: z.array(z.object({ rule: z.string(), example: z.string() })).max(6),
  mistakes: z.array(z.object({ wrong: z.string(), right: z.string(), why: z.string() })).max(4),
  quiz: z
    .array(
      z.object({
        question: z.string(),
        options: z.array(z.string()).min(2).max(4),
        answerIndex: z.number().int().min(0).max(3),
        explain: z.string(),
      }),
    )
    .max(6),
});
export type GrammarLesson = z.infer<typeof LessonSchema>;

export const grammarLesson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ topic: z.string().min(2).max(60), level: LEVEL }).parse(d))
  .handler(async ({ data, context }) => {
    await quota("grammar", 20);
    const gw = getGateway(context.userId);
    const { output } = await generateText({
      model: gw(AI_MODEL),
      output: Output.object({ schema: LessonSchema }),
      prompt: `Sen o'zbek o'quvchilar uchun ingliz tili grammatika ustozisan.
Mavzu: "${data.topic}". O'quvchi darajasi: ${data.level}.
Tushuntirish O'ZBEK tilida, misollar ingliz tilida bo'lsin.
- "explanation": 3-5 gapli sodda tushuntirish
- "rules": 3-5 ta qoida va misol
- "mistakes": o'zbeklar ko'p qiladigan 3 ta xato (wrong / right / why)
- "quiz": 5 ta test savoli (4 variant, to'g'ri javob indeksi, o'zbekcha izoh)
Faqat JSON qaytar.`,
    });
    return output;
  });

/** Grammatika testidan keyin XP beradi. */
export const finishGrammarQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ correct: z.number().int().min(0).max(20), total: z.number().int().min(1).max(20) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const xp = Math.min(20, data.correct * 3);
    try {
      await context.supabase.rpc("award_progress", {
        _reason: "grammatika",
        _xp: xp,
        _coins: data.correct >= data.total - 1 ? 3 : 1,
      });
    } catch {
      /* ignore */
    }
    return { xp };
  });

/* ------------------------------------------------------------------ *
 * 3) AI suhbatdosh ustoz
 * ------------------------------------------------------------------ */

export const TUTOR_ROLES = [
  { code: "friend", title: "Do'st bilan suhbat", emoji: "🙂", brief: "kundalik erkin muloqot" },
  { code: "cafe", title: "Kafeda buyurtma", emoji: "☕", brief: "ofitsiant bilan suhbat" },
  { code: "interview", title: "Ish suhbati", emoji: "💼", brief: "HR menejer bilan intervyu" },
  { code: "airport", title: "Aeroportda", emoji: "✈️", brief: "ro'yxatdan o'tish va yo'l so'rash" },
  { code: "doctor", title: "Shifokorda", emoji: "🩺", brief: "shikoyat va maslahat" },
  { code: "shop", title: "Do'konda xarid", emoji: "🛍️", brief: "narx va o'lcham so'rash" },
  { code: "ielts", title: "IELTS Speaking", emoji: "🎓", brief: "imtihon uslubidagi savollar" },
] as const;

const TurnSchema = z.object({
  reply: z.string(),
  translation: z.string(),
  correction: z.string().nullable(),
  tip: z.string().nullable(),
  suggestions: z.array(z.string()).max(3),
});
export type TutorTurn = z.infer<typeof TurnSchema>;

export const tutorReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        role: z.string().min(2).max(20),
        level: LEVEL,
        history: z
          .array(z.object({ who: z.enum(["me", "ai"]), text: z.string().max(600) }))
          .max(24)
          .default([]),
        message: z.string().max(600).default(""),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await quota("tutor", 60);
    const role = TUTOR_ROLES.find((r) => r.code === data.role) ?? TUTOR_ROLES[0];
    const gw = getGateway(context.userId);
    const convo = data.history.map((h) => `${h.who === "me" ? "Student" : "You"}: ${h.text}`).join("\n");

    const { output } = await generateText({
      model: gw(AI_MODEL),
      output: Output.object({ schema: TurnSchema }),
      prompt: `Sen ingliz tili suhbatdosh ustozisan. Rol: ${role.title} (${role.brief}).
O'quvchi darajasi: ${data.level} — shu darajaga mos sodda ingliz tilida gapir.
${convo ? `Suhbat tarixi:\n${convo}\n` : "Suhbatni o'zing samimiy salom bilan boshla.\n"}
${data.message ? `Student: ${data.message}` : ""}

Javob qaytar:
- "reply": keyingi gapingiz INGLIZ tilida (1-3 gap, oxirida savol bo'lsin)
- "translation": shu javobning o'zbekcha tarjimasi
- "correction": o'quvchi xato yozgan bo'lsa to'g'ri variant (ingliz tilida), aks holda null
- "tip": xato sababi o'zbekcha 1 gap, aks holda null
- "suggestions": o'quvchi ayta oladigan 2-3 ta qisqa ingliz javob varianti
Faqat JSON.`,
    });

    if (output.correction && data.message) {
      try {
        await context.supabase.from("mistakes").insert({
          user_id: context.userId,
          question: `Suhbat: ${role.title}`,
          wrong_answer: data.message.slice(0, 300),
          correct_answer: output.correction.slice(0, 300),
          explanation: output.tip,
          tag: "Suhbat",
          skill: "speaking",
        });
      } catch {
        /* ignore */
      }
    }
    if (data.message.trim().length > 3) {
      try {
        await context.supabase.rpc("award_progress", { _reason: "suhbat", _xp: 2, _coins: 0 });
      } catch {
        /* ignore */
      }
    }
    return output;
  });
