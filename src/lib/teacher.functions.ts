/**
 * BO'LIM A — Ustoz paneli uchun server funksiyalari.
 *
 * Barcha o'qishlar RLS ostida yoki ustoz egaligini tekshiruvchi
 * SECURITY DEFINER funksiyalar orqali bajariladi, shuning uchun bir ustoz
 * boshqa ustozning guruhini yoki o'quvchining shaxsiy hisob ma'lumotlarini
 * (email, parol) hech qachon ko'ra olmaydi (A19).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireTeacher, requireStudent } from "./role-middleware";
import { z } from "zod";

const Uuid = z.object({ groupId: z.string().uuid() });

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return (res.data ?? []) as T;
}

/* ---------------- A1 — guruh yaratish / o'chirish ---------------- */

export const createGroup = createServerFn({ method: "POST" })
  .middleware([requireTeacher])
  .inputValidator((d: unknown) =>
    z
      .object({
        name: z.string().trim().min(2).max(60),
        lessonDays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const res = await context.supabase.rpc("create_group", {
      _name: data.name,
      _lesson_days: data.lessonDays,
    });
    if (res.error) throw new Error(res.error.message);
    return (res.data as unknown as { id: string; name: string; join_code: string }[])[0];
  });

export const updateGroup = createServerFn({ method: "POST" })
  .middleware([requireTeacher])
  .inputValidator((d: unknown) =>
    z
      .object({
        groupId: z.string().uuid(),
        name: z.string().trim().min(2).max(60).optional(),
        lessonDays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
        archived: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const patch: { name?: string; lesson_days?: number[]; archived?: boolean } = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.lessonDays !== undefined) patch.lesson_days = data.lessonDays;
    if (data.archived !== undefined) patch.archived = data.archived;
    const { error } = await context.supabase.from("groups").update(patch).eq("id", data.groupId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteGroup = createServerFn({ method: "POST" })
  .middleware([requireTeacher])
  .inputValidator((d: unknown) => Uuid.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("groups").delete().eq("id", data.groupId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeStudent = createServerFn({ method: "POST" })
  .middleware([requireTeacher])
  .inputValidator((d: unknown) =>
    z.object({ groupId: z.string().uuid(), studentId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("group_members")
      .delete()
      .eq("group_id", data.groupId)
      .eq("student_id", data.studentId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- A2, A9, A13, A16 — umumiy ko'rinish ---------------- */

export const groupsOverview = createServerFn({ method: "GET" })
  .middleware([requireTeacher])
  .handler(async ({ context }) => unwrap(await context.supabase.rpc("teacher_groups_overview")));

export const groupSummary = createServerFn({ method: "POST" })
  .middleware([requireTeacher])
  .inputValidator((d: unknown) => Uuid.parse(d))
  .handler(async ({ data, context }) => {
    const rows = unwrap(await context.supabase.rpc("teacher_group_summary", { _gid: data.groupId }));
    return rows[0] ?? null;
  });

/* ---------------- A3, A5, A8, A17 — o'quvchilar jadvali ---------------- */

export const groupStudents = createServerFn({ method: "POST" })
  .middleware([requireTeacher])
  .inputValidator((d: unknown) => Uuid.parse(d))
  .handler(async ({ data, context }) =>
    unwrap(await context.supabase.rpc("teacher_group_students", { _gid: data.groupId })),
  );

export const groupTopMistakes = createServerFn({ method: "POST" })
  .middleware([requireTeacher])
  .inputValidator((d: unknown) => Uuid.parse(d))
  .handler(async ({ data, context }) =>
    unwrap(await context.supabase.rpc("teacher_group_top_mistakes", { _gid: data.groupId, _limit: 8 })),
  );

/* ---------------- A7 — taraqqiyot grafiklari ---------------- */

export const groupActivity = createServerFn({ method: "POST" })
  .middleware([requireTeacher])
  .inputValidator((d: unknown) =>
    z.object({ groupId: z.string().uuid(), days: z.number().int().min(7).max(90) }).parse(d),
  )
  .handler(async ({ data, context }) =>
    unwrap(await context.supabase.rpc("teacher_group_activity", { _gid: data.groupId, _days: data.days })),
  );

/* ---------------- A4 — individual o'quvchi profili ---------------- */

export const studentActivity = createServerFn({ method: "POST" })
  .middleware([requireTeacher])
  .inputValidator((d: unknown) =>
    z.object({ studentId: z.string().uuid(), days: z.number().int().min(7).max(90) }).parse(d),
  )
  .handler(async ({ data, context }) =>
    unwrap(await context.supabase.rpc("teacher_student_activity", { _sid: data.studentId, _days: data.days })),
  );

export const studentMistakes = createServerFn({ method: "POST" })
  .middleware([requireTeacher])
  .inputValidator((d: unknown) => z.object({ studentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) =>
    unwrap(await context.supabase.rpc("teacher_student_mistakes", { _sid: data.studentId, _limit: 100 })),
  );

/* ---------------- A6 — topshiriqlar ---------------- */

export const listAssignments = createServerFn({ method: "POST" })
  .middleware([requireTeacher])
  .inputValidator((d: unknown) => Uuid.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("assignments")
      .select("*, assignment_completions(student_id, completed_at)")
      .eq("group_id", data.groupId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createAssignment = createServerFn({ method: "POST" })
  .middleware([requireTeacher])
  .inputValidator((d: unknown) =>
    z
      .object({
        groupId: z.string().uuid(),
        title: z.string().trim().min(2).max(120),
        topic: z.string().trim().max(120).optional(),
        level: z.enum(["oson", "orta", "qiyin"]).default("orta"),
        note: z.string().trim().max(500).optional(),
        dueDate: z.string().max(10).optional(),
        targetStudentId: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("assignments").insert({
      group_id: data.groupId,
      teacher_id: context.userId,
      title: data.title,
      topic: data.topic ?? null,
      level: data.level,
      note: data.note ?? null,
      due_date: data.dueDate || null,
      target_student_id: data.targetStudentId ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAssignment = createServerFn({ method: "POST" })
  .middleware([requireTeacher])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("assignments").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- A11, A12 — ustoz materiallari ---------------- */

export const listMaterials = createServerFn({ method: "GET" })
  .middleware([requireTeacher])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("teacher_materials")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createMaterial = createServerFn({ method: "POST" })
  .middleware([requireTeacher])
  .inputValidator((d: unknown) =>
    z
      .object({
        groupId: z.string().uuid().nullable().default(null),
        title: z.string().trim().min(2).max(120),
        kind: z.enum(["words", "topic"]).default("words"),
        content: z.string().trim().min(1).max(8000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("teacher_materials").insert({
      teacher_id: context.userId,
      group_id: data.groupId,
      title: data.title,
      kind: data.kind,
      content: data.content,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** A12 — materialni boshqa guruhga bitta bosishda nusxalash. */
export const copyMaterial = createServerFn({ method: "POST" })
  .middleware([requireTeacher])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), toGroupId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: src, error } = await context.supabase
      .from("teacher_materials")
      .select("title, kind, content")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!src) throw new Error("Material topilmadi");
    const ins = await context.supabase.from("teacher_materials").insert({
      teacher_id: context.userId,
      group_id: data.toGroupId,
      title: src.title,
      kind: src.kind,
      content: src.content,
    });
    if (ins.error) throw new Error(ins.error.message);
    return { ok: true };
  });

export const deleteMaterial = createServerFn({ method: "POST" })
  .middleware([requireTeacher])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("teacher_materials").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- A15 — dars dasturi kuzatuvchisi ---------------- */

export const listCurriculum = createServerFn({ method: "POST" })
  .middleware([requireTeacher])
  .inputValidator((d: unknown) => Uuid.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("curriculum_entries")
      .select("*")
      .eq("group_id", data.groupId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const addCurriculum = createServerFn({ method: "POST" })
  .middleware([requireTeacher])
  .inputValidator((d: unknown) =>
    z
      .object({
        groupId: z.string().uuid(),
        topic: z.string().trim().min(2).max(120),
        plannedDate: z.string().max(10).optional(),
        notes: z.string().trim().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { count } = await context.supabase
      .from("curriculum_entries")
      .select("id", { count: "exact", head: true })
      .eq("group_id", data.groupId);
    const { error } = await context.supabase.from("curriculum_entries").insert({
      group_id: data.groupId,
      teacher_id: context.userId,
      topic: data.topic,
      planned_date: data.plannedDate || null,
      notes: data.notes ?? null,
      position: count ?? 0,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markCurriculumTaught = createServerFn({ method: "POST" })
  .middleware([requireTeacher])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), taught: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("curriculum_entries")
      .update({ taught_at: data.taught ? new Date().toISOString().slice(0, 10) : null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCurriculum = createServerFn({ method: "POST" })
  .middleware([requireTeacher])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("curriculum_entries").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- A18 — haftalik avtomatik hisobot ---------------- */

export const weeklyReport = createServerFn({ method: "POST" })
  .middleware([requireTeacher])
  .inputValidator((d: unknown) => Uuid.parse(d))
  .handler(async ({ data, context }) => {
    const rows = unwrap(await context.supabase.rpc("teacher_weekly_report", { _gid: data.groupId }));
    return rows[0] ?? null;
  });

/* ---------------- O'quvchi tomoni (A1, A6, A15, A19) ---------------- */

export const myGroup = createServerFn({ method: "GET" })
  .middleware([requireStudent])
  .handler(async ({ context }) => {
    const rows = unwrap(await context.supabase.rpc("my_group"));
    return rows[0] ?? null;
  });

export const joinGroup = createServerFn({ method: "POST" })
  .middleware([requireStudent])
  .inputValidator((d: unknown) =>
    z.object({ code: z.string().trim().regex(/^\d{6}$/, "Kod 6 xonali raqam bo'lishi kerak") }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const res = await context.supabase.rpc("join_group_by_code", { _code: data.code });
    if (res.error) throw new Error(res.error.message);
    return (res.data as unknown as { group_id: string; group_name: string }[])[0];
  });

export const leaveGroup = createServerFn({ method: "POST" })
  .middleware([requireStudent])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("group_members")
      .delete()
      .eq("student_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const myAssignments = createServerFn({ method: "GET" })
  .middleware([requireStudent])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("assignments")
      .select("*, assignment_completions(student_id, completed_at)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const completeAssignment = createServerFn({ method: "POST" })
  .middleware([requireStudent])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("assignment_completions")
      .insert({ assignment_id: data.id, student_id: context.userId });
    if (error && !error.message.includes("duplicate")) throw new Error(error.message);
    return { ok: true };
  });

export const myCurriculum = createServerFn({ method: "GET" })
  .middleware([requireStudent])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("curriculum_entries")
      .select("topic, planned_date, taught_at, notes")
      .order("position", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });
