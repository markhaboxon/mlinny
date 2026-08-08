/**
 * BO'LIM E — Interaktiv hikoya darslari.
 *
 * O'quvchi real hayotiy vaziyatga tushadi (aeroport, ish suhbati, shifokor...)
 * va AI qarshi tomon rolini o'ynaydi. Har bir javobdan keyin AI:
 *  - hikoyani davom ettiradi,
 *  - o'zbekcha tarjima beradi,
 *  - 3 ta tayyor javob varianti taklif qiladi,
 *  - o'quvchi xatosi bo'lsa qisqa grammatik eslatma qo'shadi.
 *
 * Suhbat tarixi bazadan o'qiladi — mijoz yuborgan tarixga ishonilmaydi,
 * shuning uchun prompt'ni tashqaridan buzib bo'lmaydi.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText, Output } from "ai";
import { z } from "zod";
import { getGateway } from "./ai-gateway.server";
import { AI_MODEL } from "./ai-model";

const MAX_TURNS = 12;

const TurnSchema = z.object({
  text: z.string(),
  translation: z.string(),
  choices: z.array(z.string()).min(2).max(3),
  grammarNote: z.string().optional(),
  finished: z.boolean().optional(),
});

export type StoryScenario = {
  code: string;
  title: string;
  description: string | null;
  emoji: string | null;
  level: string;
};

export type StoryTurn = {
  id: string;
  role: "ai" | "user";
  text: string;
  translation: string | null;
  choices: string[];
  grammarNote: string | null;
};

function levelHint(level: string) {
  if (level === "past") return "A1 daraja: juda oddiy va qisqa gaplar, 8-12 so'z.";
  if (level === "yaxshi") return "B1-B2 daraja: tabiiy, boyroq lug'at, iboralar ishlatilsin.";
  return "A2-B1 daraja: oddiy, lekin to'liq gaplar.";
}

export const listScenarios = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StoryScenario[]> => {
    const { data, error } = await context.supabase
      .from("story_scenarios")
      .select("code, title, description, emoji, level, sort")
      .eq("active", true)
      .order("sort");
    if (error) throw error;
    return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      code: r.code as string,
      title: r.title as string,
      description: (r.description as string | null) ?? null,
      emoji: (r.emoji as string | null) ?? null,
      level: (r.level as string) ?? "orta",
    }));
  });

async function loadTurns(
  supabase: { from: (t: string) => any },
  sessionId: string,
): Promise<StoryTurn[]> {
  const { data } = await supabase
    .from("story_turns")
    .select("id, role, text, translation, choices, grammar_note")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    role: r.role as "ai" | "user",
    text: r.text as string,
    translation: (r.translation as string | null) ?? null,
    choices: Array.isArray(r.choices) ? (r.choices as string[]) : [],
    grammarNote: (r.grammar_note as string | null) ?? null,
  }));
}

export const startStory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ code: z.string().min(1).max(60), age: z.number().int().min(4).max(100) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: sc, error: scErr } = await context.supabase
      .from("story_scenarios")
      .select("code, title, seed_prompt, level")
      .eq("code", data.code)
      .eq("active", true)
      .maybeSingle();
    if (scErr) throw scErr;
    if (!sc) throw new Error("Bunday hikoya topilmadi");

    const { data: session, error: sErr } = await context.supabase
      .from("story_sessions")
      .insert({ user_id: context.userId, scenario_code: data.code })
      .select("id")
      .single();
    if (sErr) throw sErr;

    const row = sc as Record<string, unknown>;
    const gw = getGateway(context.userId);
    const { output } = await generateText({
      model: gw(AI_MODEL),
      output: Output.object({ schema: TurnSchema }),
      prompt: `Sen interaktiv ingliz tili rolli o'yinini boshqarasan.
Vaziyat: ${row.seed_prompt as string}
O'quvchi yoshi: ${data.age}. ${levelHint((row.level as string) ?? "orta")}

Birinchi sahnani boshla. Sen o'quvchining suhbatdoshi rolidasan (xodim, ishga oluvchi, sotuvchi va h.k.).
Qoidalar:
- "text": inglizcha 1-3 gap — sening gaping va o'quvchiga savol.
- "translation": shu gapning o'zbekcha tarjimasi.
- "choices": o'quvchi ayta oladigan 3 ta inglizcha javob varianti (har biri qisqa, farqli).
- "finished": false.
Faqat JSON qaytar.`,
    });

    const sessionId = (session as { id: string }).id;
    await context.supabase.from("story_turns").insert({
      session_id: sessionId,
      user_id: context.userId,
      role: "ai",
      text: output.text,
      translation: output.translation,
      choices: output.choices,
    });

    return {
      sessionId,
      title: row.title as string,
      turns: await loadTurns(context.supabase as never, sessionId),
      finished: false,
    };
  });

export const replyStory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        sessionId: z.string().uuid(),
        message: z.string().min(1).max(600),
        age: z.number().int().min(4).max(100),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    // RLS o'z sessiyasidan boshqasini ko'rsatmaydi — begona sessiyaga yozib bo'lmaydi.
    const { data: session, error } = await context.supabase
      .from("story_sessions")
      .select("id, scenario_code, turns, status")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (error) throw error;
    if (!session) throw new Error("Sessiya topilmadi");

    const s = session as Record<string, unknown>;
    const turnCount = Number(s.turns ?? 0) + 1;

    const { data: sc } = await context.supabase
      .from("story_scenarios")
      .select("seed_prompt, level")
      .eq("code", s.scenario_code as string)
      .maybeSingle();

    await context.supabase.from("story_turns").insert({
      session_id: data.sessionId,
      user_id: context.userId,
      role: "user",
      text: data.message,
    });

    const history = await loadTurns(context.supabase as never, data.sessionId);
    const transcript = history
      .map((t) => `${t.role === "ai" ? "PARTNER" : "LEARNER"}: ${t.text}`)
      .join("\n");

    const mustEnd = turnCount >= MAX_TURNS;
    const gw = getGateway(context.userId);
    const { output } = await generateText({
      model: gw(AI_MODEL),
      output: Output.object({ schema: TurnSchema }),
      prompt: `Sen interaktiv ingliz tili rolli o'yinini boshqarasan.
Vaziyat: ${(sc as Record<string, unknown> | null)?.seed_prompt ?? ""}
O'quvchi yoshi: ${data.age}. ${levelHint(((sc as Record<string, unknown> | null)?.level as string) ?? "orta")}

Hozirgacha bo'lgan suhbat:
${transcript}

Sening navbating. Qoidalar:
- "text": inglizcha 1-3 gap javob, hikoyani mantiqan davom ettir.
- "translation": o'zbekcha tarjima.
- "choices": o'quvchi uchun 3 ta yangi inglizcha javob varianti.
- "grammarNote": agar o'quvchining oxirgi gapida xato bo'lsa, o'zbekcha 1 gapda tuzat. Xato bo'lmasa bo'sh qoldir.
- "finished": ${mustEnd ? "true (hikoyani chiroyli yakunla)" : "vaziyat mantiqan tugagan bo'lsa true, aks holda false"}.
Faqat JSON qaytar.`,
    });

    const finished = mustEnd || output.finished === true;

    await context.supabase.from("story_turns").insert({
      session_id: data.sessionId,
      user_id: context.userId,
      role: "ai",
      text: output.text,
      translation: output.translation,
      choices: finished ? [] : output.choices,
      grammar_note: output.grammarNote || null,
    });

    await context.supabase
      .from("story_sessions")
      .update({ turns: turnCount, status: finished ? "done" : "active" })
      .eq("id", data.sessionId);

    let reward: { xp: number; coins: number } | null = null;
    if (finished) {
      const xp = Math.min(120, 20 + turnCount * 8);
      const coins = Math.min(60, 10 + turnCount * 4);
      await context.supabase.rpc("award_progress", {
        _reason: `hikoya:${s.scenario_code as string}`,
        _xp: xp,
        _coins: coins,
      });
      reward = { xp, coins };
    }

    return {
      turns: await loadTurns(context.supabase as never, data.sessionId),
      finished,
      reward,
    };
  });
