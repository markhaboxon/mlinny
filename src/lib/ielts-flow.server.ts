/**
 * IELTS oqimi — server tomonidagi barcha mantiq (sessiya, baholash, tarix).
 * Bu fayl faqat serverda ishlaydi (`.server.ts`).
 */
import { generateText, Output } from "ai";
import { z } from "zod";
import { getGateway, gatewayFetch } from "./ai-gateway.server";
import { AI_MODEL } from "./ai-model";
import {
  getMaterial,
  gradeObjective,
  toListeningSection,
  toReadingPassage,
} from "./ielts.server";
import { pickSpeakingSet, pickWritingTask } from "./ielts-bank";
import { overallBand, roundBand, type IeltsVariant } from "./ielts-types";

const AI_DAILY_LIMIT = 25;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function consumeQuota(userId: string, kind: string, limit = AI_DAILY_LIMIT) {
  const db = await admin();
  const { data: row } = await db
    .from("ai_usage_daily")
    .select("used")
    .eq("user_id", userId)
    .eq("kind", kind)
    .maybeSingle();
  const used = Number((row as { used?: number } | null)?.used ?? 0);
  if (used >= limit) {
    throw new Error("Bugungi IELTS AI limiti tugadi. Ertaga qayta urinib ko'ring.");
  }
  await db
    .from("ai_usage_daily")
    .upsert({ user_id: userId, kind, used: used + 1 }, { onConflict: "user_id,kind,day" });
}

async function profileOf(userId: string) {
  const db = await admin();
  const { data } = await db
    .from("profiles")
    .select("user_id, ielts_variant, ielts_target_band")
    .eq("user_id", userId)
    .maybeSingle();
  const variant = ((data as { ielts_variant?: string } | null)?.ielts_variant ??
    "academic") as IeltsVariant;
  const target = (data as { ielts_target_band?: number | null } | null)?.ielts_target_band ?? null;
  return { variant, target };
}

// ---------------------------------------------------------------------------
// Bosh sahifa: sozlamalar, tarix, trend, zaif tomonlar
// ---------------------------------------------------------------------------
export async function ieltsHome(userId: string) {
  const db = await admin();
  const { variant, target } = await profileOf(userId);
  const { data } = await db
    .from("ielts_attempts")
    .select("id, skill, variant, band, raw_score, total, mock_id, detail, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(60);

  const attempts = (data ?? []).map((a) => ({
    id: a.id as string,
    skill: a.skill as string,
    variant: a.variant as string,
    band: a.band === null ? null : Number(a.band),
    raw: a.raw_score as number | null,
    total: a.total as number | null,
    mockId: (a.mock_id as string | null) ?? null,
    createdAt: a.created_at as string,
  }));

  const best: Record<string, number> = {};
  for (const a of attempts) {
    if (a.band === null) continue;
    best[a.skill] = Math.max(best[a.skill] ?? 0, a.band);
  }

  // Eng ko'p uchragan zaif tomonlar (Writing/Speaking izohlaridan).
  const weak = new Map<string, number>();
  for (const a of data ?? []) {
    const detail = (a.detail ?? {}) as { improvements?: string[] };
    for (const s of detail.improvements ?? []) {
      const key = s.trim().slice(0, 120);
      if (key) weak.set(key, (weak.get(key) ?? 0) + 1);
    }
  }
  const weakness = [...weak.entries()]
    .sort((x, y) => y[1] - x[1])
    .slice(0, 6)
    .map(([text, count]) => ({ text, count }));

  const current = overallBand(
    (["listening", "reading", "writing", "speaking"] as const)
      .map((s) => best[s])
      .filter((v): v is number => typeof v === "number"),
  );

  return { variant, target, attempts, best, weakness, current };
}

export async function saveSettings(
  userId: string,
  data: { variant?: IeltsVariant; targetBand?: number | null },
) {
  const db = await admin();
  const patch: Record<string, unknown> = {};
  if (data.variant) patch["ielts_variant"] = data.variant;
  if (data.targetBand !== undefined) patch["ielts_target_band"] = data.targetBand;
  if (Object.keys(patch).length) await db.from("profiles").update(patch as never).eq("user_id", userId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Listening / Reading sessiyalari
// ---------------------------------------------------------------------------
export async function startObjective(
  skill: "listening" | "reading",
  userId: string,
  opts: { practice?: boolean; sections?: number[]; mockId?: string | null },
) {
  const { variant } = await profileOf(userId);
  const sections = opts.sections?.length
    ? [...opts.sections].sort((a, b) => a - b)
    : skill === "listening"
      ? [1, 2, 3, 4]
      : [1, 2, 3];

  await consumeQuota(userId, `ielts_${skill}_start`, 12);

  const materials = [];
  for (const s of sections) materials.push(await getMaterial(skill, variant, s, userId));

  const db = await admin();
  const { data: session, error } = await db
    .from("ielts_sessions")
    .insert({
      user_id: userId,
      skill,
      variant,
      practice: !!opts.practice,
      mock_id: opts.mockId ?? null,
      material_ids: materials.map((m) => m.id),
    })
    .select("id")
    .single();
  if (error || !session) throw new Error(error?.message ?? "Sessiya ochilmadi");

  let start = 1;
  const parts = materials.map((m) => {
    const part =
      skill === "listening" ? toListeningSection(m, start) : toReadingPassage(m, start);
    start += m.payload.questions.length;
    return part;
  });

  return {
    sessionId: session.id as string,
    skill,
    variant,
    practice: !!opts.practice,
    totalQuestions: start - 1,
    parts,
  };
}

export async function submitObjectiveSession(
  userId: string,
  sessionId: string,
  answers: Record<string, string>,
) {
  const db = await admin();
  const { data: session } = await db
    .from("ielts_sessions")
    .select("id, user_id, skill, variant, material_ids, mock_id, submitted_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session || session.user_id !== userId) throw new Error("Sessiya topilmadi");

  const skill = session.skill as "listening" | "reading";
  const variant = session.variant as IeltsVariant;
  const { graded, raw, total, band } = await gradeObjective(
    skill,
    variant,
    (session.material_ids as string[]) ?? [],
    answers,
  );

  await db.from("ielts_sessions").update({ submitted_at: new Date().toISOString() }).eq("id", sessionId);

  const { data: attempt } = await db
    .from("ielts_attempts")
    .insert({
      user_id: userId,
      skill,
      variant,
      band,
      raw_score: raw,
      total,
      mock_id: (session.mock_id as string | null) ?? null,
      detail: { answers: graded } as never,
    })
    .select("id")
    .single();

  return { attemptId: (attempt?.id as string) ?? "", skill, raw, total, band, answers: graded };
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------
export async function writingTaskFor(userId: string, task: 1 | 2) {
  const { variant } = await profileOf(userId);
  const picked = pickWritingTask(task, variant, `${userId}:${task}:${Date.now() >> 22}`);
  return { ...picked, variant };
}

const WritingSchema = z.object({
  task_achievement: z.number().min(0).max(9),
  coherence_cohesion: z.number().min(0).max(9),
  lexical_resource: z.number().min(0).max(9),
  grammar: z.number().min(0).max(9),
  overall: z.number().min(0).max(9),
  strengths: z.array(z.string()).max(6),
  improvements: z.array(z.string()).max(6),
  corrected_examples: z
    .array(z.object({ original: z.string(), corrected: z.string(), reason: z.string() }))
    .max(10),
});

function halfStep(n: number) {
  return Math.max(0, Math.min(9, Math.round(n * 2) / 2));
}

export async function gradeWritingSubmission(
  userId: string,
  data: { task: 1 | 2; taskId: string; prompt: string; text: string; mockId?: string | null },
) {
  await consumeQuota(userId, "ielts_writing", 15);
  const { variant } = await profileOf(userId);
  const words = data.text.trim().split(/\s+/).filter(Boolean).length;
  const minWords = data.task === 1 ? 150 : 250;

  const gw = getGateway(userId);
  const { output } = await generateText({
    model: gw(AI_MODEL),
    output: Output.object({ schema: WritingSchema }),
    prompt: `Sen rasmiy IELTS ekzaminatorisan. Quyidagi ${data.task === 1 ? "Task 1" : "Task 2"} (${variant === "general" ? "General Training" : "Academic"}) yozuvini rasmiy IELTS mezonlari bo'yicha baholab, JSON qaytar:
{
  "task_achievement": <0-9, 0.5 qadam>,
  "coherence_cohesion": <0-9>,
  "lexical_resource": <0-9>,
  "grammar": <0-9>,
  "overall": <o'rtacha, 0.5 ga yaxlitlangan>,
  "strengths": ["...", "..."],
  "improvements": ["...", "..."],
  "corrected_examples": [{"original": "...", "corrected": "...", "reason": "..."}]
}
Faqat JSON qaytar, boshqa hech narsa yozma.

Topshiriq: """${data.prompt}"""
So'z soni: ${words} (minimal talab: ${minWords}${words < minWords ? " — talabdan kam, Task Achievement bandi pasaytirilsin" : ""}).
"strengths", "improvements" va "reason" maydonlari O'ZBEK tilida bo'lsin; "original"/"corrected" ingliz tilida.
Kamida 4 ta aniq xato tuzatishi ("corrected_examples") ko'rsat.

O'quvchi yozuvi:
"""${data.text}"""`,
  });

  const score = {
    ...output,
    task_achievement: halfStep(output.task_achievement),
    coherence_cohesion: halfStep(output.coherence_cohesion),
    lexical_resource: halfStep(output.lexical_resource),
    grammar: halfStep(output.grammar),
    overall: roundBand(
      (output.task_achievement +
        output.coherence_cohesion +
        output.lexical_resource +
        output.grammar) /
        4,
    ),
  };

  const db = await admin();
  const { data: attempt } = await db
    .from("ielts_attempts")
    .insert({
      user_id: userId,
      skill: "writing",
      variant,
      band: score.overall,
      mock_id: data.mockId ?? null,
      detail: {
        task: data.task,
        taskId: data.taskId,
        prompt: data.prompt,
        text: data.text,
        words,
        minWords,
        ...score,
      } as never,
    })
    .select("id")
    .single();

  return { attemptId: (attempt?.id as string) ?? "", words, minWords, score };
}

// ---------------------------------------------------------------------------
// Speaking (audio → transkripsiya + baholash)
// ---------------------------------------------------------------------------
export async function speakingSetFor(userId: string) {
  const set = pickSpeakingSet(`${userId}:${Date.now() >> 23}`);
  return set;
}

type SpeakingJson = {
  transcript: string;
  fluency_coherence: number;
  lexical_resource: number;
  grammar: number;
  pronunciation: number;
  overall: number;
  strengths: string[];
  improvements: string[];
  corrected_examples: { original: string; corrected: string; reason: string }[];
};

export async function gradeSpeakingSubmission(
  userId: string,
  data: {
    setId: string;
    questions: string[];
    audio: string;
    mimeType: string;
    transcriptHint?: string;
    mockId?: string | null;
  },
) {
  await consumeQuota(userId, "ielts_speaking", 12);
  const { variant } = await profileOf(userId);

  const format = data.mimeType.includes("mp4")
    ? "mp4"
    : data.mimeType.includes("mpeg") || data.mimeType.includes("mp3")
      ? "mp3"
      : data.mimeType.includes("ogg")
        ? "ogg"
        : "webm";

  const instruction = `Sen rasmiy IELTS Speaking ekzaminatorisan. Audiodagi nutqni avval so'zma-so'z transkripsiya qil, keyin rasmiy IELTS mezonlari bo'yicha baholab FAQAT JSON qaytar:
{"transcript":"...","fluency_coherence":<0-9>,"lexical_resource":<0-9>,"grammar":<0-9>,"pronunciation":<0-9>,"overall":<0-9>,"strengths":["..."],"improvements":["..."],"corrected_examples":[{"original":"...","corrected":"...","reason":"..."}]}
Ballar 0.5 qadam bilan. "strengths", "improvements", "reason" — o'zbek tilida. Kamida 3 ta tuzatish ko'rsat.
Savollar: ${data.questions.slice(0, 8).join(" | ")}`;

  const fetcher = gatewayFetch(userId);
  const res = await fetcher(
    "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: AI_MODEL,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: instruction },
              { type: "input_audio", input_audio: { data: data.audio, format } },
            ],
          },
        ],
      }),
    },
  );

  let parsed: SpeakingJson | null = null;
  if (res.ok) {
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = json.choices?.[0]?.message?.content ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]) as SpeakingJson;
      } catch {
        parsed = null;
      }
    }
  }

  // Zaxira yo'l: audio tahlili ishlamasa, brauzer transkriptidan foydalanamiz.
  if (!parsed) {
    const hint = (data.transcriptHint ?? "").trim();
    if (hint.length < 20) {
      throw new Error(
        "Audio tahlil qilinmadi. Iltimos, qaytadan yozib ko'ring yoki tinchroq joyda urinib ko'ring.",
      );
    }
    const gw = getGateway(userId);
    const { output } = await generateText({
      model: gw(AI_MODEL),
      output: Output.object({
        schema: z.object({
          fluency_coherence: z.number().min(0).max(9),
          lexical_resource: z.number().min(0).max(9),
          grammar: z.number().min(0).max(9),
          pronunciation: z.number().min(0).max(9),
          overall: z.number().min(0).max(9),
          strengths: z.array(z.string()).max(6),
          improvements: z.array(z.string()).max(6),
          corrected_examples: z
            .array(z.object({ original: z.string(), corrected: z.string(), reason: z.string() }))
            .max(8),
        }),
      }),
      prompt: `Sen rasmiy IELTS Speaking ekzaminatorisan. Quyidagi nutq transkriptini 4 mezon bo'yicha baholab JSON qaytar (talaffuz bahosi transkriptdagi ma'lumot asosida taxminiy bo'lsin). Izohlar o'zbek tilida.
Savollar: ${data.questions.slice(0, 8).join(" | ")}
Transkript: """${hint}"""`,
    });
    parsed = { transcript: hint, ...output };
  }

  const score = {
    transcript: parsed.transcript ?? "",
    fluency_coherence: halfStep(parsed.fluency_coherence),
    lexical_resource: halfStep(parsed.lexical_resource),
    grammar: halfStep(parsed.grammar),
    pronunciation: halfStep(parsed.pronunciation),
    strengths: parsed.strengths ?? [],
    improvements: parsed.improvements ?? [],
    corrected_examples: parsed.corrected_examples ?? [],
    overall: roundBand(
      (parsed.fluency_coherence +
        parsed.lexical_resource +
        parsed.grammar +
        parsed.pronunciation) /
        4,
    ),
  };

  const db = await admin();
  const { data: attempt } = await db
    .from("ielts_attempts")
    .insert({
      user_id: userId,
      skill: "speaking",
      variant,
      band: score.overall,
      mock_id: data.mockId ?? null,
      detail: { setId: data.setId, questions: data.questions, ...score } as never,
    })
    .select("id")
    .single();

  return { attemptId: (attempt?.id as string) ?? "", score };
}

// ---------------------------------------------------------------------------
// Mock test
// ---------------------------------------------------------------------------
export async function newMock(_userId: string) {
  return { mockId: crypto.randomUUID() };
}

export async function mockState(userId: string, mockId: string) {
  const db = await admin();
  const { data } = await db
    .from("ielts_attempts")
    .select("skill, band, raw_score, total, created_at")
    .eq("user_id", userId)
    .eq("mock_id", mockId)
    .order("created_at", { ascending: true });
  const parts = (data ?? [])
    .filter((a) => a.skill !== "mock")
    .map((a) => ({
      skill: a.skill as string,
      band: a.band === null ? null : Number(a.band),
      raw: a.raw_score as number | null,
      total: a.total as number | null,
    }));
  return { parts, done: parts.map((p) => p.skill) };
}

export async function completeMock(userId: string, mockId: string) {
  const db = await admin();
  const { parts } = await mockState(userId, mockId);
  const bands = parts
    .map((p) => p.band)
    .filter((b): b is number => typeof b === "number" && !Number.isNaN(b));
  if (!bands.length) throw new Error("Bu mock testda hali natija yo'q");
  const overall = overallBand(bands);
  const { variant } = await profileOf(userId);

  const { data: existing } = await db
    .from("ielts_attempts")
    .select("id")
    .eq("user_id", userId)
    .eq("mock_id", mockId)
    .eq("skill", "mock")
    .maybeSingle();

  if (existing) {
    await db
      .from("ielts_attempts")
      .update({ band: overall, detail: { parts } as never })
      .eq("id", existing.id as string);
    return { overall, parts };
  }

  await db.from("ielts_attempts").insert({
    user_id: userId,
    skill: "mock",
    variant,
    band: overall,
    mock_id: mockId,
    detail: { parts } as never,
  });
  return { overall, parts };
}

// ---------------------------------------------------------------------------
// Admin materiallari
// ---------------------------------------------------------------------------
async function requireAdmin(userId: string) {
  const db = await admin();
  const { data } = await db
    .from("app_accounts")
    .select("kind")
    .eq("user_id", userId)
    .maybeSingle();
  if ((data as { kind?: string } | null)?.kind !== "admin") throw new Error("Ruxsat yo'q");
}

export async function listMaterialsForAdmin(userId: string) {
  await requireAdmin(userId);
  const db = await admin();
  const { data } = await db
    .from("ielts_materials")
    .select("id, kind, variant, section, title, source, active, uses, created_at, payload")
    .order("created_at", { ascending: false })
    .limit(200);
  return (data ?? []).map((m) => ({
    id: m.id as string,
    kind: m.kind as string,
    variant: m.variant as string,
    section: m.section as number,
    title: m.title as string,
    source: m.source as string,
    active: Boolean(m.active),
    uses: Number(m.uses ?? 0),
    createdAt: m.created_at as string,
    questions: Array.isArray((m.payload as { questions?: unknown[] })?.questions)
      ? ((m.payload as { questions: unknown[] }).questions.length as number)
      : 0,
  }));
}

const ManualSchema = z.object({
  title: z.string().min(3),
  instructions: z.string().optional(),
  lines: z
    .array(z.object({ speaker: z.string(), gender: z.enum(["male", "female"]), text: z.string() }))
    .optional(),
  paragraphs: z.array(z.object({ label: z.string(), text: z.string() })).optional(),
  questions: z
    .array(
      z.object({
        type: z.string(),
        prompt: z.string(),
        options: z.array(z.string()).optional(),
        limit: z.string().optional(),
        answer: z.string(),
        alternatives: z.array(z.string()).optional(),
        explain: z.string().default(""),
      }),
    )
    .min(1),
});

export async function saveManualMaterial(
  userId: string,
  data: { kind: "listening" | "reading"; variant: IeltsVariant; section: number; json: string },
) {
  await requireAdmin(userId);
  let parsed: unknown;
  try {
    parsed = JSON.parse(data.json);
  } catch {
    throw new Error("JSON noto'g'ri formatda");
  }
  const payload = ManualSchema.parse(parsed);
  const db = await admin();
  const { error } = await db.from("ielts_materials").insert({
    kind: data.kind,
    variant: data.variant,
    section: data.section,
    title: payload.title,
    payload: payload as never,
    source: "manual",
    created_by: userId,
  });
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function toggleMaterial(userId: string, data: { id: string; active: boolean }) {
  await requireAdmin(userId);
  const db = await admin();
  await db.from("ielts_materials").update({ active: data.active }).eq("id", data.id);
  return { ok: true };
}
