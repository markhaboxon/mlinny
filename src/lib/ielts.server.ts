/**
 * IELTS — server tomoni: material generatsiyasi (keshlangan), javoblarni
 * tekshirish va AI baholash. Javob kalitlari HECH QACHON brauzerga
 * yuborilmaydi: `ielts_materials` jadvali faqat service_role uchun ochiq.
 */
import { generateText, Output } from "ai";
import { z } from "zod";
import { getGateway } from "./ai-gateway.server";
import { AI_MODEL } from "./ai-model";
import {
  normalizeAnswer,
  toBand,
  type GradedAnswer,
  type IeltsQuestion,
  type IeltsVariant,
  type ListeningSection,
  type ReadingPassage,
} from "./ielts-types";

/** Har bir slot uchun bankda saqlanadigan maksimal material soni. */
const BANK_SIZE = 6;

const QuestionSchema = z.object({
  type: z.enum([
    "mcq",
    "form_completion",
    "matching",
    "labelling",
    "sentence_completion",
    "true_false_ng",
    "yes_no_ng",
    "matching_headings",
    "matching_information",
    "matching_features",
    "matching_endings",
    "summary_completion",
    "diagram_completion",
    "short_answer",
  ]),
  prompt: z.string(),
  options: z.array(z.string()).optional(),
  limit: z.string().optional(),
  answer: z.string(),
  alternatives: z.array(z.string()).optional(),
  explain: z.string(),
});
type RawQuestion = z.infer<typeof QuestionSchema>;

const ListeningSchema = z.object({
  title: z.string(),
  instructions: z.string(),
  lines: z.array(
    z.object({
      speaker: z.string(),
      gender: z.enum(["male", "female"]),
      text: z.string(),
    }),
  ),
  questions: z.array(QuestionSchema),
});

const ReadingSchema = z.object({
  title: z.string(),
  paragraphs: z.array(z.object({ label: z.string(), text: z.string() })),
  instructions: z.string().optional(),
  questions: z.array(QuestionSchema),
});

export type StoredMaterial = {
  id: string;
  kind: "listening" | "reading";
  section: number;
  title: string;
  payload: {
    title: string;
    instructions?: string;
    lines?: { speaker: string; gender: "male" | "female"; text: string }[];
    paragraphs?: { label: string; text: string }[];
    questions: RawQuestion[];
  };
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

// ---------------------------------------------------------------------------
// Generatsiya
// ---------------------------------------------------------------------------
const LISTENING_BRIEF: Record<number, string> = {
  1: "Section 1: kundalik hayotdagi ikki kishilik suhbat (masalan mehmonxona yoki kurs buyurtmasi). Eng oson. Savol turlari: form_completion (ko'pchiligi) va sentence_completion.",
  2: "Section 2: bitta kishining kundalik mavzudagi monologi (masalan yangi sport markazi haqida yo'l-yo'riq). Savol turlari: mcq, labelling (xarita/reja), matching.",
  3: "Section 3: ta'lim sharoitida 2-3 kishilik suhbat (talabalar va o'qituvchi loyiha muhokamasi). Savol turlari: mcq, matching, sentence_completion.",
  4: "Section 4: akademik ma'ruza, bitta ma'ruzachi monologi. Eng qiyin. Savol turlari: form_completion (note completion) va sentence_completion.",
};

const READING_BRIEF: Record<number, string> = {
  1: "Passage 1 — eng oson (400-600 so'z). 13 ta savol. Savol turlari: true_false_ng, sentence_completion, short_answer, matching_information.",
  2: "Passage 2 — o'rta qiyinlik (600-800 so'z). 13 ta savol. Savol turlari: matching_headings, matching_features, summary_completion, mcq.",
  3: "Passage 3 — eng qiyin (700-900 so'z). 14 ta savol. Savol turlari: yes_no_ng, matching_endings, diagram_completion, mcq, short_answer.",
};

async function generateListening(section: number, variant: IeltsVariant, userId?: string) {
  const gw = getGateway(userId);
  const { output } = await generateText({
    model: gw(AI_MODEL),
    output: Output.object({ schema: ListeningSchema }),
    prompt: `You are an official IELTS test writer. Create ONE authentic IELTS Listening section in British English.
${LISTENING_BRIEF[section]}
Exam type: ${variant === "general" ? "General Training" : "Academic"}.

Rules:
- The transcript must be natural spoken English, 550-750 words, split into "lines" with a speaker name and gender for each turn (monologue = one speaker).
- Exactly 10 questions, numbered in the order the information appears in the transcript.
- "answer" must be EXACTLY the words heard in the transcript (for completion questions max 2 words + a number). For mcq/matching/labelling the answer must be the exact option text.
- For mcq/matching/labelling/headings include an "options" array (3-6 items).
- For completion questions set "limit" to e.g. "NO MORE THAN TWO WORDS AND/OR A NUMBER".
- "explain" (in Uzbek) must quote the exact sentence from the transcript where the answer is heard.
- All question text in English, explanations in Uzbek.`,
  });
  return output;
}

async function generateReading(section: number, variant: IeltsVariant, userId?: string) {
  const gw = getGateway(userId);
  const count = section === 3 ? 14 : 13;
  const { output } = await generateText({
    model: gw(AI_MODEL),
    output: Output.object({ schema: ReadingSchema }),
    prompt: `You are an official IELTS test writer. Create ONE authentic IELTS Reading passage in British English.
${READING_BRIEF[section]}
Exam type: ${variant === "general" ? "General Training (everyday / workplace topics, notices, job or course information)" : "Academic (research or science based topic)"}.

Rules:
- Split the passage into paragraphs with labels "A", "B", "C"... Each paragraph 60-160 words.
- Exactly ${count} questions in passage order, mixing the question types listed above.
- true_false_ng answers must be exactly "TRUE", "FALSE" or "NOT GIVEN"; yes_no_ng: "YES", "NO", "NOT GIVEN".
- Completion / short answer: "answer" must be words copied from the passage (max 3 words), plus "limit".
- Matching types must include an "options" array and the answer must be the exact option text.
- "explain" (in Uzbek) must quote the sentence from the passage and say how it paraphrases the question.
- Questions in English, explanations in Uzbek.`,
  });
  return output;
}

function numberQuestions(questions: RawQuestion[], startAt: number) {
  return questions.map((q, i) => ({ ...q, number: startAt + i }));
}

/**
 * Keshdan material oladi; bank to'lmagan bo'lsa yangisini AI orqali yaratadi.
 */
export async function getMaterial(
  kind: "listening" | "reading",
  variant: IeltsVariant,
  section: number,
  userId?: string,
): Promise<StoredMaterial> {
  const db = await admin();
  const { data: rows } = await db
    .from("ielts_materials")
    .select("id, kind, section, title, payload, uses")
    .eq("kind", kind)
    .eq("variant", variant)
    .eq("section", section)
    .eq("active", true)
    .order("uses", { ascending: true })
    .limit(BANK_SIZE);

  const bank = rows ?? [];
  const shouldGenerate = bank.length < BANK_SIZE;

  if (!shouldGenerate || bank.length > 0) {
    // Bank bo'sh bo'lmasa, avval mavjudlaridan foydalanamiz (kam ishlatilgani).
    // Bank to'lmagan bo'lsa ham 50% hollarda yangisini yaratib bankni boyitamiz.
    const wantNew = shouldGenerate && Math.random() < 0.5;
    if (!wantNew) {
      const pick = bank[Math.floor(Math.random() * Math.min(bank.length, 3))]!;
      await db
        .from("ielts_materials")
        .update({ uses: Number(pick.uses ?? 0) + 1 })
        .eq("id", pick.id);
      return pick as unknown as StoredMaterial;
    }
  }

  const generated =
    kind === "listening"
      ? await generateListening(section, variant, userId)
      : await generateReading(section, variant, userId);

  const payload = { ...generated, questions: generated.questions } as StoredMaterial["payload"];
  const { data: inserted, error } = await db
    .from("ielts_materials")
    .insert({
      kind,
      variant,
      section,
      title: generated.title,
      payload: payload as never,
      source: "ai",
      uses: 1,
    })
    .select("id, kind, section, title, payload")
    .single();

  if (error || !inserted) {
    if (bank.length) return bank[0] as unknown as StoredMaterial;
    throw new Error(error?.message ?? "IELTS materialini saqlab bo'lmadi");
  }
  return inserted as unknown as StoredMaterial;
}

/** Javob kalitisiz — brauzerga yuboriladigan ko'rinish. */
export function publicQuestions(m: StoredMaterial, startAt: number): IeltsQuestion[] {
  return numberQuestions(m.payload.questions, startAt).map((q) => ({
    id: `${m.id}:${q.number}`,
    number: q.number,
    type: q.type,
    prompt: q.prompt,
    ...(q.options ? { options: q.options } : {}),
    ...(q.limit ? { limit: q.limit } : {}),
  }));
}

export function toListeningSection(m: StoredMaterial, startAt: number): ListeningSection {
  return {
    section: m.section,
    title: m.payload.title,
    instructions: m.payload.instructions ?? "",
    lines: m.payload.lines ?? [],
    questions: publicQuestions(m, startAt),
  };
}

export function toReadingPassage(m: StoredMaterial, startAt: number): ReadingPassage {
  return {
    section: m.section,
    title: m.payload.title,
    paragraphs: m.payload.paragraphs ?? [],
    questions: publicQuestions(m, startAt),
  };
}

// ---------------------------------------------------------------------------
// Baholash (obyektiv testlar)
// ---------------------------------------------------------------------------
export async function gradeObjective(
  skill: "listening" | "reading",
  variant: IeltsVariant,
  materialIds: string[],
  answers: Record<string, string>,
) {
  const db = await admin();
  const { data } = await db
    .from("ielts_materials")
    .select("id, kind, section, title, payload")
    .in("id", materialIds);

  const byId = new Map((data ?? []).map((m) => [m.id as string, m as unknown as StoredMaterial]));
  const graded: GradedAnswer[] = [];
  let number = 1;

  for (const id of materialIds) {
    const m = byId.get(id);
    if (!m) continue;
    for (const q of m.payload.questions) {
      const key = `${m.id}:${number}`;
      const given = (answers[key] ?? "").trim();
      const accepted = [q.answer, ...(q.alternatives ?? [])].map(normalizeAnswer);
      const ok = given.length > 0 && accepted.includes(normalizeAnswer(given));
      graded.push({
        id: key,
        number,
        prompt: q.prompt,
        given,
        correct: q.answer,
        ok,
        explain: q.explain,
      });
      number += 1;
    }
  }

  const total = graded.length;
  const raw = graded.filter((g) => g.ok).length;
  return { graded, raw, total, band: toBand(skill, variant, raw, total) };
}
