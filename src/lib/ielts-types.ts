// Client-safe IELTS types, band tables and labels. No server imports here.

export type IeltsVariant = "academic" | "general";
export type IeltsSkill = "listening" | "reading" | "writing" | "speaking" | "mock";

/** Savol turlari — spetsifikatsiyadagi barcha turlar. */
export type IeltsQuestionType =
  // Listening
  | "mcq"
  | "form_completion"
  | "matching"
  | "labelling"
  | "sentence_completion"
  // Reading (qo'shimcha)
  | "true_false_ng"
  | "yes_no_ng"
  | "matching_headings"
  | "matching_information"
  | "matching_features"
  | "matching_endings"
  | "summary_completion"
  | "diagram_completion"
  | "short_answer";

export const QUESTION_TYPE_LABEL: Record<IeltsQuestionType, string> = {
  mcq: "Ko'p variantli",
  form_completion: "Forma/jadval to'ldirish",
  matching: "Moslashtirish",
  labelling: "Xarita/diagramma belgilash",
  sentence_completion: "Gap to'ldirish",
  true_false_ng: "True / False / Not Given",
  yes_no_ng: "Yes / No / Not Given",
  matching_headings: "Sarlavhalarni moslashtirish",
  matching_information: "Ma'lumotni moslashtirish",
  matching_features: "Xususiyatlarni moslashtirish",
  matching_endings: "Gap oxirlarini moslashtirish",
  summary_completion: "Xulosa/jadval to'ldirish",
  diagram_completion: "Diagramma belgilarini to'ldirish",
  short_answer: "Qisqa javob",
};

/** Foydalanuvchiga yuboriladigan savol (javob kaliti YO'Q). */
export type IeltsQuestion = {
  id: string;
  type: IeltsQuestionType;
  number: number;
  prompt: string;
  /** mcq / matching / labelling / headings uchun variantlar. */
  options?: string[];
  /** "NO MORE THAN TWO WORDS" kabi cheklov. */
  limit?: string;
};

export type ListeningLine = { speaker: string; gender: "male" | "female"; text: string };

export type ListeningSection = {
  section: number;
  title: string;
  instructions: string;
  lines: ListeningLine[];
  questions: IeltsQuestion[];
};

export type ReadingPassage = {
  section: number;
  title: string;
  paragraphs: { label: string; text: string }[];
  questions: IeltsQuestion[];
};

export type GradedAnswer = {
  id: string;
  number: number;
  prompt: string;
  given: string;
  correct: string;
  ok: boolean;
  explain: string;
};

export type ObjectiveResult = {
  attemptId: string;
  skill: "listening" | "reading";
  raw: number;
  total: number;
  band: number;
  answers: GradedAnswer[];
};

export type WritingScore = {
  task_achievement: number;
  coherence_cohesion: number;
  lexical_resource: number;
  grammar: number;
  overall: number;
  strengths: string[];
  improvements: string[];
  corrected_examples: { original: string; corrected: string; reason: string }[];
};

export type SpeakingScore = {
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

// ---------------------------------------------------------------------------
// Rasmiy IELTS raw → band konversiyasi (40 savol)
// ---------------------------------------------------------------------------
function fromTable(table: [number, number][], raw: number): number {
  for (const [min, band] of table) if (raw >= min) return band;
  return 0;
}

const LISTENING: [number, number][] = [
  [39, 9], [37, 8.5], [35, 8], [33, 7.5], [30, 7], [27, 6.5], [23, 6], [20, 5.5],
  [16, 5], [13, 4.5], [11, 4], [8, 3.5], [6, 3], [4, 2.5], [3, 2], [2, 1.5], [1, 1],
];

const READING_ACADEMIC: [number, number][] = [
  [39, 9], [37, 8.5], [35, 8], [33, 7.5], [30, 7], [27, 6.5], [23, 6], [19, 5.5],
  [15, 5], [13, 4.5], [10, 4], [8, 3.5], [6, 3], [4, 2.5], [3, 2], [2, 1.5], [1, 1],
];

const READING_GENERAL: [number, number][] = [
  [40, 9], [39, 8.5], [37, 8], [36, 7.5], [34, 7], [32, 6.5], [30, 6], [27, 5.5],
  [23, 5], [19, 4.5], [15, 4], [12, 3.5], [9, 3], [6, 2.5], [4, 2], [2, 1.5], [1, 1],
];

/** 40 balllik testni rasmiy jadval bo'yicha band'ga aylantiradi. */
export function toBand(
  skill: "listening" | "reading",
  variant: IeltsVariant,
  raw: number,
  total = 40,
): number {
  const scaled = total === 40 ? raw : Math.round((raw / Math.max(1, total)) * 40);
  if (skill === "listening") return fromTable(LISTENING, scaled);
  return fromTable(variant === "general" ? READING_GENERAL : READING_ACADEMIC, scaled);
}

/** IELTS 0.25/0.75 qoidasi bilan 0.5 ga yaxlitlash. */
export function roundBand(value: number): number {
  const floor = Math.floor(value);
  const rest = value - floor;
  if (rest < 0.25) return floor;
  if (rest < 0.75) return floor + 0.5;
  return floor + 1;
}

/** Overall band = 4 ko'nikma o'rtachasi, 0.5 ga yaxlitlangan. */
export function overallBand(bands: number[]): number {
  const list = bands.filter((b) => typeof b === "number" && !Number.isNaN(b));
  if (!list.length) return 0;
  return roundBand(list.reduce((a, b) => a + b, 0) / list.length);
}

export const SKILL_LABEL: Record<IeltsSkill, string> = {
  listening: "Listening",
  reading: "Reading",
  writing: "Writing",
  speaking: "Speaking",
  mock: "To'liq mock test",
};

/** Javobni solishtirish uchun normalizatsiya. */
export function normalizeAnswer(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\u0400-\u04ff ]+/gi, " ")
    .replace(/\b(a|an|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
