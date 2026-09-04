/**
 * BO'LIM P — Talaffuz murabbiyi.
 *
 * Brauzer nutqni matnga aylantiradi (Web Speech API), server esa maqsad matn
 * bilan solishtirib AI tahlil beradi. Kunlik limit `consume_ai_quota` orqali.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText, Output } from "ai";
import { z } from "zod";
import { getGateway } from "./ai-gateway.server";
import { AI_MODEL } from "./ai-model";

const DAILY_LIMIT = 30;

const PronFeedbackSchema = z.object({
  score: z.number().int().min(0).max(100),
  summary: z.string(),
  problems: z
    .array(z.object({ word: z.string(), issue: z.string(), tip: z.string() }))
    .max(6),
  tips: z.array(z.string()).max(4),
});
export type PronFeedback = z.infer<typeof PronFeedbackSchema>;

/** Mashq uchun jumlalar — darajaga qarab. */
export const pronouncePrompts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ level: z.enum(["past", "orta", "yaxshi"]).default("orta") }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const gw = getGateway(context.userId);
    const Schema = z.object({ items: z.array(z.object({ text: z.string(), focus: z.string() })).max(8) });
    try {
      const { output } = await generateText({
        model: gw(AI_MODEL),
        output: Output.object({ schema: Schema }),
        prompt: `Ingliz tili talaffuz mashqi uchun 6 ta jumla yoz. Daraja: ${data.level}.
Har biri 4-10 so'zdan iborat, o'zbek o'quvchilar uchun qiyin tovushlarni (th, w/v, r, æ, ŋ) o'z ichiga olsin.
"focus" — o'zbekcha 1 gapli izoh: bu jumlada qaysi tovushga e'tibor berish kerak.
Faqat JSON: {"items":[{"text":"...","focus":"..."}]}`,
      });
      return output.items;
    } catch {
      return [
        { text: "Think about the three thin trees.", focus: "th tovushi — til tishlar orasida." },
        { text: "We visited a very small village.", focus: "v va w farqi." },
        { text: "The red car turned right.", focus: "r tovushi yumshoq aytiladi." },
        { text: "That cat had a black hat.", focus: "æ tovushi — 'a' keng ochiladi." },
        { text: "Singing brings everything along.", focus: "ng burun tovushi." },
        { text: "She sells sea shells by the shore.", focus: "s va sh farqi." },
      ];
    }
  });

/** Aytilgan matnni maqsad bilan solishtirib baholaydi. */
export const gradePronunciation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        target: z.string().min(1).max(300),
        heard: z.string().min(1).max(300),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: quota } = await supabaseAdmin.rpc("consume_ai_quota", {
      _kind: "pronounce",
      _limit: DAILY_LIMIT,
    });
    if ((quota as Record<string, unknown> | null)?.allowed === false) {
      throw new Error("Bugungi talaffuz tahlili limiti tugadi. Ertaga davom eting.");
    }

    const gw = getGateway(context.userId);
    const { output } = await generateText({
      model: gw(AI_MODEL),
      output: Output.object({ schema: PronFeedbackSchema }),
      prompt: `Sen ingliz tili talaffuz murabbiysisan. O'quvchi quyidagi jumlani o'qidi.
Maqsad: "${data.target}"
Nutq tanuvchi eshitgani: "${data.heard}"

Farqlarga qarab talaffuzni baholab ber. Javob O'ZBEK tilida:
- "score": 0-100
- "summary": 1-2 gapli umumiy fikr
- "problems": xato aytilgan so'zlar (word), muammo (issue), qanday tuzatish (tip)
- "tips": 2-4 ta amaliy maslahat
Faqat JSON qaytar.`,
    });

    await context.supabase.from("pronunciation_attempts").insert({
      user_id: context.userId,
      target: data.target,
      heard: data.heard,
      score: output.score,
      feedback: output,
    });

    if (output.score >= 60) {
      try {
        await context.supabase.rpc("award_progress", { _reason: "pronounce", _xp: 5, _coins: 1 });
      } catch {
        /* mukofotsiz ham natija saqlanadi */
      }
    }

    return output;
  });

/** Oxirgi urinishlar tarixi (progressni ko'rsatish uchun). */
export const pronunciationHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("pronunciation_attempts")
      .select("id, target, score, created_at")
      .order("created_at", { ascending: false })
      .limit(10);
    return (data ?? []).map((r) => ({
      id: String(r.id),
      target: String(r.target),
      score: Number(r.score ?? 0),
      createdAt: String(r.created_at),
    }));
  });
