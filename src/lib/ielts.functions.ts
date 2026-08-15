/**
 * IELTS bo'limi — server funksiyalari.
 * Barcha javob kalitlari va baholash faqat serverda; mijoz hech qachon
 * to'g'ri javoblarni testdan oldin ko'rmaydi.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const VariantSchema = z.enum(["academic", "general"]);

// ---------------------------------------------------------------------------
// Sozlamalar va tarix
// ---------------------------------------------------------------------------
export const getIeltsHome = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { ieltsHome } = await import("./ielts-flow.server");
    return ieltsHome(context.userId);
  });

export const saveIeltsSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        variant: VariantSchema.optional(),
        targetBand: z.number().min(1).max(9).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { saveSettings } = await import("./ielts-flow.server");
    return saveSettings(context.userId, data);
  });

// ---------------------------------------------------------------------------
// Listening / Reading
// ---------------------------------------------------------------------------
export const startListening = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        practice: z.boolean().default(false),
        sections: z.array(z.number().int().min(1).max(4)).min(1).max(4).optional(),
        mockId: z.string().uuid().nullable().optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { startObjective } = await import("./ielts-flow.server");
    return startObjective("listening", context.userId, data);
  });

export const startReading = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        practice: z.boolean().default(false),
        sections: z.array(z.number().int().min(1).max(3)).min(1).max(3).optional(),
        mockId: z.string().uuid().nullable().optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { startObjective } = await import("./ielts-flow.server");
    return startObjective("reading", context.userId, data);
  });

export const submitObjective = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        sessionId: z.string().uuid(),
        answers: z.record(z.string(), z.string().max(200)),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { submitObjectiveSession } = await import("./ielts-flow.server");
    return submitObjectiveSession(context.userId, data.sessionId, data.answers);
  });

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------
export const getWritingTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ task: z.union([z.literal(1), z.literal(2)]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { writingTaskFor } = await import("./ielts-flow.server");
    return writingTaskFor(context.userId, data.task);
  });

export const submitWriting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        task: z.union([z.literal(1), z.literal(2)]),
        taskId: z.string().max(40),
        prompt: z.string().max(1500),
        text: z.string().min(40).max(8000),
        mockId: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { gradeWritingSubmission } = await import("./ielts-flow.server");
    return gradeWritingSubmission(context.userId, data);
  });

// ---------------------------------------------------------------------------
// Speaking
// ---------------------------------------------------------------------------
export const getSpeakingTest = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { speakingSetFor } = await import("./ielts-flow.server");
    return speakingSetFor(context.userId);
  });

export const submitSpeaking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        setId: z.string().max(40),
        questions: z.array(z.string().max(400)).max(20),
        /** base64 (data URI'siz) audio, webm/ogg/mp4. */
        audio: z.string().min(500).max(9_000_000),
        mimeType: z.string().max(60).default("audio/webm"),
        transcriptHint: z.string().max(4000).optional(),
        mockId: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { gradeSpeakingSubmission } = await import("./ielts-flow.server");
    return gradeSpeakingSubmission(context.userId, data);
  });

// ---------------------------------------------------------------------------
// Mock test
// ---------------------------------------------------------------------------
export const startMock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { newMock } = await import("./ielts-flow.server");
    return newMock(context.userId);
  });

export const finishMock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ mockId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { completeMock } = await import("./ielts-flow.server");
    return completeMock(context.userId, data.mockId);
  });

export const getMockState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ mockId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { mockState } = await import("./ielts-flow.server");
    return mockState(context.userId, data.mockId);
  });

// ---------------------------------------------------------------------------
// Admin — qo'lda material qo'shish / ko'rish
// ---------------------------------------------------------------------------
export const adminListMaterials = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listMaterialsForAdmin } = await import("./ielts-flow.server");
    return listMaterialsForAdmin(context.userId);
  });

export const adminSaveMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        kind: z.enum(["listening", "reading"]),
        variant: VariantSchema,
        section: z.number().int().min(1).max(4),
        json: z.string().min(20).max(200_000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { saveManualMaterial } = await import("./ielts-flow.server");
    return saveManualMaterial(context.userId, data);
  });

export const adminToggleMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), active: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { toggleMaterial } = await import("./ielts-flow.server");
    return toggleMaterial(context.userId, data);
  });
