import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTeacher } from "./role-middleware";

import { z } from "zod";

const KIND = z.enum(["admin", "teacher", "student", "user"]);

/* ------------------------------------------------------------------ *
 * Public (no session yet)
 * ------------------------------------------------------------------ */

export const adminExists = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count } = await supabaseAdmin
    .from("app_accounts")
    .select("id", { count: "exact", head: true })
    .eq("kind", "admin");
  return { exists: (count ?? 0) > 0 };
});

/**
 * First-run only: creates the very first admin when none exists yet.
 * Requires the server-side ADMIN_SETUP_SECRET so anonymous visitors cannot
 * mint an admin account (even if the admin row is later deleted).
 */
export const bootstrapAdmin = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        login: z.string().min(3).max(32),
        password: z.string().min(8).max(72),
        setupSecret: z.string().min(1).max(200),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const expected = process.env["ADMIN_SETUP_SECRET"];
    if (!expected || expected.length < 8) {
      throw new Error("Sozlash o'chirilgan. Administrator bilan bog'laning.");
    }
    if (data.setupSecret !== expected) {
      throw new Error("Sozlash kaliti noto'g'ri.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createAccount, logActivity } = await import("./access.server");
    const { count } = await supabaseAdmin
      .from("app_accounts")
      .select("id", { count: "exact", head: true })
      .eq("kind", "admin");
    if ((count ?? 0) > 0) throw new Error("Admin allaqachon mavjud");
    const { account } = await createAccount({
      login: data.login,
      password: data.password,
      kind: "admin",
      createdBy: null,
    });
    await logActivity(account.user_id, account.login, "admin_bootstrap");
    return { ok: true };
  });


/**
 * One-time access link. Returns the credentials once so the browser can sign in;
 * the link is burned immediately and never works again.
 */
export const redeemLink = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().min(10).max(64) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { emailOf, logActivity, resetAccountPassword } = await import("./access.server");

    const { data: link } = await supabaseAdmin
      .from("access_links")
      .select("id, account_id, used_at")
      .eq("token", data.token)
      .maybeSingle();
    if (!link) throw new Error("Havola topilmadi yoki noto'g'ri.");
    if (link.used_at) throw new Error("Siz allaqachon tizimga kirgansiz — bu havola ishlatilgan.");

    const { data: acc } = await supabaseAdmin
      .from("app_accounts")
      .select("*")
      .eq("id", link.account_id)
      .maybeSingle();
    if (!acc) throw new Error("Hisob topilmadi.");
    if (!acc.active) throw new Error("Bu hisob bloklangan. Admin bilan bog'laning.");

    await supabaseAdmin
      .from("access_links")
      .update({ used_at: new Date().toISOString() })
      .eq("id", link.id);

    await logActivity(acc.user_id as string, acc.login as string, "link_redeem");

    // A fresh one-time password is minted here; nothing is ever stored in cleartext.
    const { password } = await resetAccountPassword(acc.id as string);

    return {
      email: emailOf(acc.login as string),
      password,
      kind: acc.kind as string,
      hasName: Boolean(acc.full_name),
    };
  });

/* ------------------------------------------------------------------ *
 * Session-bound
 * ------------------------------------------------------------------ */

export const myAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { accountOfUser } = await import("./access.server");
    const acc = await accountOfUser(context.userId);
    if (!acc) return { kind: "user" as const, login: null, groupId: null, active: true, fullName: null };
    return {
      kind: acc.kind,
      login: acc.login,
      groupId: acc.group_id,
      active: acc.active,
      fullName: acc.full_name,
    };
  });

/** Called right after sign-in and periodically while the app is open. */
export const heartbeat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ action: z.string().max(60).optional(), first: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { accountOfUser, logActivity } = await import("./access.server");
    const acc = await accountOfUser(context.userId);
    const now = new Date().toISOString();
    if (acc) {
      await supabaseAdmin
        .from("app_accounts")
        .update({ last_seen_at: now, first_login_at: acc.first_login_at ?? now })
        .eq("id", acc.id);
    }
    const action = data.action ?? "faol";
    const { data: last } = await supabaseAdmin
      .from("activity_log")
      .select("action, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const stale = !last || Date.now() - new Date(last.created_at as string).getTime() > 10 * 60 * 1000;
    if (data.first || !last || last.action !== action || stale) {
      await logActivity(context.userId, acc?.login ?? null, data.first ? "kirdi" : action);
    }
    return { ok: true };
  });

/* ------------------------------------------------------------------ *
 * Admin panel
 * ------------------------------------------------------------------ */

export const listAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { requireKind } = await import("./access.server");
    await requireKind(context.userId, ["admin"]);
    const { data: accounts } = await supabaseAdmin
      .from("app_accounts")
      .select("*")
      .order("created_at", { ascending: false });
    const { data: links } = await supabaseAdmin
      .from("access_links")
      .select("account_id, token, used_at, created_at")
      .order("created_at", { ascending: false });
    const { data: groups } = await supabaseAdmin.from("groups").select("id, name");
    const linkOf = new Map<string, { token: string; used_at: string | null }>();
    for (const l of links ?? []) {
      if (!linkOf.has(l.account_id as string)) {
        linkOf.set(l.account_id as string, { token: l.token as string, used_at: l.used_at as string | null });
      }
    }
    const groupName = new Map((groups ?? []).map((g) => [g.id as string, g.name as string]));
    return (accounts ?? []).map((a) => ({
      id: a.id as string,
      login: a.login as string,
      kind: a.kind as string,
      fullName: (a.full_name as string) ?? null,
      active: a.active as boolean,
      groupName: a.group_id ? groupName.get(a.group_id as string) ?? null : null,
      createdAt: a.created_at as string,
      firstLoginAt: (a.first_login_at as string) ?? null,
      lastSeenAt: (a.last_seen_at as string) ?? null,
      link: linkOf.get(a.id as string) ?? null,
    }));
  });

export const createAccountFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        login: z.string().min(3).max(32),
        password: z.string().min(4).max(72),
        kind: KIND,
        fullName: z.string().max(60).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireKind, createAccount, logActivity } = await import("./access.server");
    const me = await requireKind(context.userId, ["admin"]);
    const { account, token } = await createAccount({
      login: data.login,
      password: data.password,
      kind: data.kind,
      fullName: data.fullName || null,
      createdBy: context.userId,
    });
    await logActivity(context.userId, me.login, "hisob_yaratdi", `${account.login} (${account.kind})`);
    return { id: account.id, login: account.login, token };
  });

export const issueLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ accountId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { accountOfUser, newLink, logActivity } = await import("./access.server");
    const me = await accountOfUser(context.userId);
    if (!me || !me.active) throw new Error("Ruxsat yo'q");
    const { data: target } = await supabaseAdmin
      .from("app_accounts")
      .select("id, login, group_id, created_by, kind")
      .eq("id", data.accountId)
      .maybeSingle();
    if (!target) throw new Error("Hisob topilmadi");
    const isOwnerTeacher =
      me.kind === "teacher" && target.created_by === context.userId && target.kind === "student";
    if (me.kind !== "admin" && !isOwnerTeacher) throw new Error("Ruxsat yo'q");
    const token = await newLink(target.id as string);
    await logActivity(context.userId, me.login, "havola_yangiladi", target.login as string);
    return { token };
  });

/** Generates a brand-new password once; the previous one stops working. */
export const resetAccountPasswordFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ accountId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { accountOfUser, resetAccountPassword, logActivity } = await import("./access.server");
    const me = await accountOfUser(context.userId);
    if (!me || !me.active) throw new Error("Ruxsat yo'q");
    const { data: target } = await supabaseAdmin
      .from("app_accounts")
      .select("id, login, created_by, kind")
      .eq("id", data.accountId)
      .maybeSingle();
    if (!target) throw new Error("Hisob topilmadi");
    const isOwnerTeacher =
      me.kind === "teacher" && target.created_by === context.userId && target.kind === "student";
    if (me.kind !== "admin" && !isOwnerTeacher) throw new Error("Ruxsat yo'q");
    const res = await resetAccountPassword(target.id as string);
    await logActivity(context.userId, me.login, "parol_yangiladi", target.login as string);
    return res;
  });

export const setAccountActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ accountId: z.string().uuid(), active: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { requireKind, logActivity } = await import("./access.server");
    const me = await requireKind(context.userId, ["admin"]);
    await supabaseAdmin.from("app_accounts").update({ active: data.active }).eq("id", data.accountId);
    await logActivity(context.userId, me.login, data.active ? "hisob_yoqdi" : "hisob_bloklandi");
    return { ok: true };
  });

export const removeAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ accountId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { requireKind, deleteAccount, logActivity } = await import("./access.server");
    const me = await requireKind(context.userId, ["admin"]);
    if (me.id === data.accountId) throw new Error("O'z hisobingizni o'chira olmaysiz");
    await deleteAccount(data.accountId);
    await logActivity(context.userId, me.login, "hisob_ochirdi");
    return { ok: true };
  });

export const listActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ limit: z.number().int().min(1).max(300).default(120) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { requireKind } = await import("./access.server");
    await requireKind(context.userId, ["admin"]);
    const { data: rows } = await supabaseAdmin
      .from("activity_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    return (rows ?? []).map((r) => ({
      id: r.id as string,
      login: (r.login as string) ?? "—",
      action: r.action as string,
      detail: (r.detail as string) ?? null,
      createdAt: r.created_at as string,
    }));
  });

export const adminStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { requireKind } = await import("./access.server");
    await requireKind(context.userId, ["admin"]);
    const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const [accounts, online, groups, today] = await Promise.all([
      supabaseAdmin.from("app_accounts").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("app_accounts").select("id", { count: "exact", head: true }).gte("last_seen_at", since),
      supabaseAdmin.from("groups").select("id", { count: "exact", head: true }).eq("archived", false),
      supabaseAdmin
        .from("daily_progress")
        .select("id", { count: "exact", head: true })
        .eq("day", new Date().toISOString().slice(0, 10)),
    ]);
    return {
      accounts: accounts.count ?? 0,
      online: online.count ?? 0,
      groups: groups.count ?? 0,
      activeToday: today.count ?? 0,
    };
  });

/* ------------------------------------------------------------------ *
 * Teacher: group creation with auto-generated student logins
 * ------------------------------------------------------------------ */

export const createGroupWithStudents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        name: z.string().min(2).max(60),
        lessonTime: z.string().max(30).optional(),
        lessonDays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
        count: z.number().int().min(0).max(40),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { requireKind, createAccount, genLogin, genPassword, logActivity } = await import("./access.server");
    const me = await requireKind(context.userId, ["teacher", "admin"]);

    const { data: group, error } = await context.supabase.rpc("create_group", {
      _name: data.name,
      _lesson_days: data.lessonDays,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(group) ? group[0] : group;
    const groupId = row.id as string;

    if (data.lessonTime) {
      await supabaseAdmin
        .from("groups")
        .update({ lesson_time: data.lessonTime, capacity: data.count })
        .eq("id", groupId);
    } else {
      await supabaseAdmin.from("groups").update({ capacity: data.count }).eq("id", groupId);
    }

    const students: { login: string; password: string; token: string }[] = [];
    for (let i = 0; i < data.count; i++) {
      const { account, token, password } = await createAccount({
        login: genLogin(data.name.replace(/\s/g, "")),
        password: genPassword(),
        kind: "student",
        groupId,
        createdBy: context.userId,
      });
      students.push({ login: account.login, password, token });
    }
    await logActivity(context.userId, me.login, "guruh_yaratdi", `${data.name} · ${data.count} o'quvchi`);
    return { groupId, name: row.name as string, joinCode: row.join_code as string, students };
  });

/** Student logins of one group, with their live link state. */
export const groupAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ groupId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { requireKind } = await import("./access.server");
    await requireKind(context.userId, ["teacher", "admin"]);
    const { data: g } = await supabaseAdmin
      .from("groups")
      .select("id, teacher_id")
      .eq("id", data.groupId)
      .maybeSingle();
    if (!g || g.teacher_id !== context.userId) throw new Error("Ruxsat yo'q");

    const { data: accounts } = await supabaseAdmin
      .from("app_accounts")
      .select("*")
      .eq("group_id", data.groupId)
      .order("created_at");
    const ids = (accounts ?? []).map((a) => a.id as string);
    const { data: links } = ids.length
      ? await supabaseAdmin
          .from("access_links")
          .select("account_id, token, used_at, created_at")
          .in("account_id", ids)
          .order("created_at", { ascending: false })
      : { data: [] as Record<string, unknown>[] };
    const linkOf = new Map<string, { token: string; used_at: string | null }>();
    for (const l of links ?? []) {
      if (!linkOf.has(l.account_id as string)) {
        linkOf.set(l.account_id as string, {
          token: l.token as string,
          used_at: (l.used_at as string) ?? null,
        });
      }
    }
    return (accounts ?? []).map((a) => ({
      id: a.id as string,
      login: a.login as string,
      fullName: (a.full_name as string) ?? null,
      active: a.active as boolean,
      firstLoginAt: (a.first_login_at as string) ?? null,
      lastSeenAt: (a.last_seen_at as string) ?? null,
      link: linkOf.get(a.id as string) ?? null,
    }));
  });

/** Add extra student logins to an existing group. */
export const addStudentLogins = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ groupId: z.string().uuid(), count: z.number().int().min(1).max(20) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { requireKind, createAccount, genLogin, genPassword } = await import("./access.server");
    await requireKind(context.userId, ["teacher", "admin"]);
    const { data: g } = await supabaseAdmin
      .from("groups")
      .select("id, name, teacher_id")
      .eq("id", data.groupId)
      .maybeSingle();
    if (!g || g.teacher_id !== context.userId) throw new Error("Ruxsat yo'q");
    const out: { login: string; password: string; token: string }[] = [];
    for (let i = 0; i < data.count; i++) {
      const { account, token, password } = await createAccount({
        login: genLogin((g.name as string).replace(/\s/g, "")),
        password: genPassword(),
        kind: "student",
        groupId: data.groupId,
        createdBy: context.userId,
      });
      out.push({ login: account.login, password, token });
    }
    return out;
  });

/** Move a student login to another group of the same teacher. */
export const moveStudentAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ accountId: z.string().uuid(), toGroupId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { requireKind } = await import("./access.server");
    await requireKind(context.userId, ["teacher", "admin"]);
    const { data: acc } = await supabaseAdmin
      .from("app_accounts")
      .select("id, user_id, group_id, created_by")
      .eq("id", data.accountId)
      .maybeSingle();
    if (!acc || acc.created_by !== context.userId) throw new Error("Ruxsat yo'q");
    const { data: g } = await supabaseAdmin
      .from("groups")
      .select("id, teacher_id")
      .eq("id", data.toGroupId)
      .maybeSingle();
    if (!g || g.teacher_id !== context.userId) throw new Error("Ruxsat yo'q");
    await supabaseAdmin.from("app_accounts").update({ group_id: data.toGroupId }).eq("id", acc.id);
    if (acc.user_id) {
      await supabaseAdmin.from("group_members").delete().eq("student_id", acc.user_id);
      await supabaseAdmin
        .from("group_members")
        .insert({ group_id: data.toGroupId, student_id: acc.user_id });
    }
    return { ok: true };
  });

/** Remove a student login entirely (teacher owns it). */
export const removeStudentAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ accountId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { requireKind, deleteAccount } = await import("./access.server");
    await requireKind(context.userId, ["teacher", "admin"]);
    const { data: acc } = await supabaseAdmin
      .from("app_accounts")
      .select("id, created_by")
      .eq("id", data.accountId)
      .maybeSingle();
    if (!acc || acc.created_by !== context.userId) throw new Error("Ruxsat yo'q");
    await deleteAccount(data.accountId);
    return { ok: true };
  });

export const finishGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ groupId: z.string().uuid(), finished: z.boolean().default(true) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("groups")
      .update({
        archived: data.finished,
        finished_at: data.finished ? new Date().toISOString() : null,
      })
      .eq("id", data.groupId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------------------------------------------ *
 * Messages and notifications
 * ------------------------------------------------------------------ */

export const sendGroupMessage = createServerFn({ method: "POST" })
  .middleware([requireTeacher])
  .inputValidator((d: unknown) =>
    z
      .object({ groupId: z.string().uuid().nullable().default(null), body: z.string().min(1).max(1000) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (data.groupId) {
      const { data: owned, error: ownErr } = await context.supabase
        .from("groups")
        .select("id")
        .eq("id", data.groupId)
        .eq("teacher_id", context.userId)
        .maybeSingle();
      if (ownErr) throw new Error(ownErr.message);
      if (!owned) throw new Error("Ruxsat yo'q");
    }
    const { error } = await context.supabase
      .from("group_messages")
      .insert({ teacher_id: context.userId, group_id: data.groupId, body: data.body });
    if (error) throw new Error(error.message);
    return { ok: true };
  });


export const listGroupMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ groupId: z.string().uuid().nullable().default(null) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("group_messages")
      .select("id, group_id, body, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (data.groupId) q = q.or(`group_id.eq.${data.groupId},group_id.is.null`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const deleteGroupMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("group_messages").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** A student finished onboarding: tell the teacher which login it was. */
export const announceJoin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ name: z.string().min(1).max(60) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { accountOfUser, logActivity } = await import("./access.server");
    const acc = await accountOfUser(context.userId);
    if (!acc) return { ok: true };
    await supabaseAdmin.from("app_accounts").update({ full_name: data.name }).eq("id", acc.id);
    await logActivity(context.userId, acc.login, "ism_kiritdi", data.name);
    if (acc.group_id && acc.created_by) {
      const { data: g } = await supabaseAdmin
        .from("groups")
        .select("name")
        .eq("id", acc.group_id)
        .maybeSingle();
      await supabaseAdmin.from("notifications").insert({
        recipient_id: acc.created_by,
        group_id: acc.group_id,
        title: `${data.name} guruhga qo'shildi`,
        body: `"${g?.name ?? "Guruh"}" — login: ${acc.login}`,
      });
    }
    return { ok: true };
  });

export const myNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("notifications")
      .select("id, title, body, read, created_at")
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const markNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await context.supabase.from("notifications").update({ read: true }).eq("read", false);
    return { ok: true };
  });

/* ------------------------------------------------------------------ *
 * Credential change
 * ------------------------------------------------------------------ */



/** Admin o'z login va/yoki parolini o'zgartiradi. */
export const changeMyCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        login: z.string().min(3).max(32).optional(),
        password: z.string().min(6).max(72).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { accountOfUser, emailOf, logActivity, normalizeLogin } = await import("./access.server");
    const acc = await accountOfUser(context.userId);
    if (!acc || acc.kind !== "admin") throw new Error("Faqat admin uchun");
    if (!data.login && !data.password) throw new Error("O'zgartirish uchun ma'lumot yo'q");

    const patch: { email?: string; password?: string } = {};
    let newLogin = acc.login;

    if (data.login) {
      newLogin = normalizeLogin(data.login);
      if (!/^[a-z0-9_.-]{3,32}$/.test(newLogin))
        throw new Error("Login 3–32 ta belgi (harf, raqam, _ . -) bo'lsin");
      if (newLogin !== acc.login) {
        const { data: taken } = await supabaseAdmin
          .from("app_accounts")
          .select("id")
          .eq("login", newLogin)
          .maybeSingle();
        if (taken) throw new Error("Bunday login band");
        patch.email = emailOf(newLogin);
      }
    }
    if (data.password) patch.password = data.password;

    const { error } = await supabaseAdmin.auth.admin.updateUserById(context.userId, patch);
    if (error) throw new Error(error.message);
    if (patch.email) await supabaseAdmin.from("app_accounts").update({ login: newLogin }).eq("id", acc.id);
    await logActivity(context.userId, newLogin, "admin_credentials_changed");
    return { login: newLogin, passwordChanged: !!data.password };
  });
