/**
 * BO'LIM G — AI yordamida tekshirish (essay / speaking) va ustoz uchun
 * topshiriq generatori.
 *
 * Kunlik AI limiti `consume_ai_quota` bazaviy funksiyasi orqali hisoblanadi.
 * U faqat `service_role` uchun ochiq, shuning uchun bu yerda admin klient
 * handler ichida yuklanadi — mijoz limitni chetlab o'ta olmaydi.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTeacher } from "./role-middleware";
import { generateText, Output } from "ai";
import { z } from "zod";
import { getGateway } from "./ai-gateway.server";
import { AI_MODEL } from "./ai-model";

const STUDENT_DAILY_LIMIT = 10;
const TEACHER_DAILY_LIMIT = 30;

const FeedbackSchema = z.object({
  score: z.number().int().min(0).max(100),
  summary: z.string(),
  strengths: z.array(z.string()).max(5),
  improvements: z.array(z.string()).max(5),
  corrections: z
    .array(z.object({ original: z.string(), better: z.string(), why: z.string() }))
    .max(8),
});

export type AiFeedback = z.infer<typeof FeedbackSchema>;

async function consumeQuota(userId: string, kind: string, limit: number) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("consume_ai_quota", { _kind: kind, _limit: limit });
  if (error) {
    // Fallback: admin klient sessiyasiz ishlaganda funksiyaga user berish kerak.
    const { data: row } = await supabaseAdmin
      .from("ai_usage_daily")
      .select("used")
      .eq("user_id", userId)
      .eq("kind", kind)
      .maybeSingle();
    const used = Number((row as { used?: number } | null)?.used ?? 0);
    if (used >= limit) throw new Error("Bugungi AI limiti tugadi. Ertaga urinib ko'ring.");
    await supabaseAdmin
      .from("ai_usage_daily")
      .upsert({ user_id: userId, kind, used: used + 1 }, { onConflict: "user_id,kind,day" });
    return;
  }
  const r = (data ?? {}) as Record<string, unknown>;
  if (r.allowed === false) throw new Error("Bugungi AI limiti tugadi. Ertaga urinib ko'ring.");
}

/** O'quvchi yozgan matn (essay) yoki nutq transkriptini AI baholaydi. */
export const gradeSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        kind: z.enum(["essay", "speaking"]),
        prompt: z.string().max(500).optional(),
        content: z.string().min(20).max(6000),
        groupId: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await consumeQuota(context.userId, `grade_${data.kind}`, STUDENT_DAILY_LIMIT);

    const gw = getGateway(context.userId);
    const kindText =
      data.kind === "essay"
        ? "yozma insho (writing)"
        : "og'zaki nutq transkripti (speaking) — talaffuz emas, mazmun va grammatika";
    const { output } = await generateText({
      model: gw(AI_MODEL),
      output: Output.object({ schema: FeedbackSchema }),
      prompt: `Sen tajribali ingliz tili o'qituvchisisan. Quyidagi ${kindText} matnini baholab ber.
${data.prompt ? `Topshiriq: "${data.prompt}"` : ""}

Matn:
"""
${data.content}
"""

Javobni O'ZBEK tilida yoz (misollar inglizcha bo'lishi mumkin):
- "score": 0-100 ball
- "summary": 2-3 gapli umumiy fikr
- "strengths": kuchli tomonlar
- "improvements": nimani yaxshilash kerak
- "corrections": xato jumla va uning to'g'ri varianti + qisqa sabab

Faqat JSON qaytar.`,
    });

    const { data: row, error } = await context.supabase
      .from("submissions")
      .insert({
        student_id: context.userId,
        kind: data.kind,
        prompt: data.prompt ?? null,
        content: data.content,
        group_id: data.groupId ?? null,
        ai_score: output.score,
        ai_feedback: output,
      })
      .select("id, created_at")
      .single();
    if (error) throw error;

    // Mehnat uchun kichik mukofot — miqdor bazada ham cheklangan.
    try {
      await context.supabase.rpc("award_progress", {
        _reason: `grade_${data.kind}`,
        _xp: 15,
        _coins: 5,
      });
    } catch {
      /* mukofot berilmasa ham baho saqlanadi */
    }

    return { id: String(row.id), createdAt: String(row.created_at), feedback: output };
  });

export type SubmissionRow = {
  id: string;
  kind: string;
  prompt: string | null;
  content: string;
  score: number | null;
  feedback: AiFeedback | null;
  createdAt: string;
  studentId: string;
};

function shapeSubmission(r: Record<string, unknown>): SubmissionRow {
  const fb = FeedbackSchema.safeParse(r.ai_feedback);
  return {
    id: String(r.id),
    kind: String(r.kind),
    prompt: (r.prompt as string | null) ?? null,
    content: String(r.content ?? ""),
    score: r.ai_score === null || r.ai_score === undefined ? null : Number(r.ai_score),
    feedback: fb.success ? fb.data : null,
    createdAt: String(r.created_at),
    studentId: String(r.student_id),
  };
}

export const listMySubmissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SubmissionRow[]> => {
    const { data, error } = await context.supabase
      .from("submissions")
      .select("*")
      .eq("student_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw error;
    return (data ?? []).map((r) => shapeSubmission(r as Record<string, unknown>));
  });

/** Ustoz o'z o'quvchilarining ishlarini ko'radi (RLS `teaches_student` bilan cheklaydi). */
export const listStudentSubmissions = createServerFn({ method: "POST" })
  .middleware([requireTeacher])
  .inputValidator((d: unknown) =>
    z.object({ studentId: z.string().uuid().nullable().optional() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<SubmissionRow[]> => {
    let q = context.supabase.from("submissions").select("*").order("created_at", { ascending: false }).limit(50);
    if (data.studentId) q = q.eq("student_id", data.studentId);
    const { data: rows, error } = await q;
    if (error) throw error;
    return (rows ?? []).map((r) => shapeSubmission(r as Record<string, unknown>));
  });

const AssignmentSchema = z.object({
  title: z.string(),
  instructions: z.string(),
  tasks: z.array(z.object({ q: z.string(), answer: z.string() })).min(1).max(20),
});

/** Ustoz uchun AI topshiriq/test generatori. */
export const genAssignmentDraft = createServerFn({ method: "POST" })
  .middleware([requireTeacher])
  .inputValidator((d: unknown) =>
    z
      .object({
        topic: z.string().min(2).max(80),
        level: z.enum(["past", "orta", "yaxshi"]).default("orta"),
        kind: z.enum(["test", "writing", "speaking", "vocab"]).default("test"),
        count: z.number().int().min(3).max(20).default(10),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await consumeQuota(context.userId, "teacher_assignment", TEACHER_DAILY_LIMIT);
    const gw = getGateway(context.userId);
    const { output } = await generateText({
      model: gw(AI_MODEL),
      output: Output.object({ schema: AssignmentSchema }),
      prompt: `Sen ingliz tili o'qituvchisisan. Mavzu: "${data.topic}". Daraja: ${data.level}.
Tur: ${data.kind}. ${data.count} ta topshiriq tuz.
- "title": qisqa sarlavha (o'zbekcha)
- "instructions": o'quvchi uchun o'zbekcha ko'rsatma
- "tasks": har biri {"q": topshiriq matni, "answer": to'g'ri javob yoki namuna javob}
Faqat JSON qaytar.`,
    });
    return output;
  });
