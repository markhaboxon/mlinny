// Server-only helpers for the login/password + one-time-link access system.
// Passwords are NEVER stored in `app_accounts`: authentication is handled by
// Supabase Auth, which keeps only a hash. A freshly generated password is
// returned once at creation/reset time and can never be read back afterwards.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { EMAIL_DOMAIN, normalizeLogin } from "@/lib/auth-config";

export { EMAIL_DOMAIN, normalizeLogin };

export type AccountKind = "admin" | "teacher" | "student" | "user";


export function emailOf(login: string) {
  return `${normalizeLogin(login)}@${EMAIL_DOMAIN}`;
}

const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

function randomChars(n: number) {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export function genLogin(prefix: string) {
  const clean = prefix.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10) || "user";
  return `${clean}${randomChars(4)}`;
}

export function genPassword() {
  return `${randomChars(4)}-${randomChars(4)}`;
}

export function genToken() {
  return randomChars(10) + randomChars(10) + randomChars(12);
}

export type AccountRow = {
  id: string;
  user_id: string | null;
  login: string;
  kind: AccountKind;
  full_name: string | null;
  group_id: string | null;
  created_by: string | null;
  active: boolean;
  first_login_at: string | null;
  last_seen_at: string | null;
  created_at: string;
};

export async function accountOfUser(userId: string): Promise<AccountRow | null> {
  const { data } = await supabaseAdmin
    .from("app_accounts")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as AccountRow | null) ?? null;
}

export async function requireKind(userId: string, kinds: AccountKind[]): Promise<AccountRow> {
  const acc = await accountOfUser(userId);
  if (!acc || !acc.active || !kinds.includes(acc.kind)) {
    throw new Error("Ruxsat yo'q");
  }
  return acc;
}

export async function logActivity(
  userId: string | null,
  login: string | null,
  action: string,
  detail?: string,
) {
  await supabaseAdmin
    .from("activity_log")
    .insert({ user_id: userId, login, action, detail: detail ?? null });
}

export async function newLink(accountId: string) {
  // Old unused links stop working as soon as a new one is issued.
  await supabaseAdmin
    .from("access_links")
    .update({ used_at: new Date().toISOString() })
    .eq("account_id", accountId)
    .is("used_at", null);
  const token = genToken();
  const { error } = await supabaseAdmin.from("access_links").insert({ account_id: accountId, token });
  if (error) throw new Error(error.message);
  return token;
}

export async function createAccount(input: {
  login: string;
  password: string;

  kind: AccountKind;
  fullName?: string | null;
  groupId?: string | null;
  createdBy: string | null;
}) {
  const login = normalizeLogin(input.login);
  if (!/^[a-z0-9_.-]{3,32}$/.test(login)) {
    throw new Error("Login 3–32 ta belgidan iborat bo'lsin (harf, raqam, _ . -)");
  }
  if (input.password.length < 4) throw new Error("Parol juda qisqa");

  const { data: exists } = await supabaseAdmin
    .from("app_accounts")
    .select("id")
    .eq("login", login)
    .maybeSingle();
  if (exists) throw new Error("Bunday login allaqachon mavjud");

  const { data: created, error: authErr } = await supabaseAdmin.auth.admin.createUser({
    email: emailOf(login),
    password: input.password,
    email_confirm: true,
    user_metadata: { login, name: input.fullName ?? null },
  });
  if (authErr || !created?.user) throw new Error(authErr?.message ?? "Hisob yaratilmadi");
  const userId = created.user.id;

  const { data: row, error } = await supabaseAdmin
    .from("app_accounts")
    .insert({
      user_id: userId,
      login,
      kind: input.kind,
      full_name: input.fullName ?? null,
      group_id: input.groupId ?? null,
      created_by: input.createdBy,
    })
    .select("*")
    .single();
  if (error) {
    await supabaseAdmin.auth.admin.deleteUser(userId);
    throw new Error(error.message);
  }

  const role =
    input.kind === "admin" ? "school_admin" : input.kind === "teacher" ? "teacher" : input.kind === "student" ? "student" : null;
  if (role) {
    await supabaseAdmin.from("user_roles").insert({ user_id: userId, role }).select();
  }
  if (input.groupId) {
    await supabaseAdmin.from("group_members").insert({ group_id: input.groupId, student_id: userId });
  }
  if (input.fullName) {
    await supabaseAdmin.from("profiles").update({ name: input.fullName }).eq("user_id", userId);
  }

  const token = await newLink(row.id as string);
  return { account: row as AccountRow, token, password: input.password };
}

export async function deleteAccount(accountId: string) {
  const { data: acc } = await supabaseAdmin
    .from("app_accounts")
    .select("id, user_id")
    .eq("id", accountId)
    .maybeSingle();
  if (!acc) return;
  await supabaseAdmin.from("app_accounts").delete().eq("id", accountId);
  if (acc.user_id) await supabaseAdmin.auth.admin.deleteUser(acc.user_id as string);
}

/**
 * Issues a brand-new random password for an account. The old one stops working
 * immediately and the new one is returned exactly once — nothing is persisted.
 */
export async function resetAccountPassword(accountId: string) {
  const { data: acc } = await supabaseAdmin
    .from("app_accounts")
    .select("id, user_id, login")
    .eq("id", accountId)
    .maybeSingle();
  if (!acc?.user_id) throw new Error("Hisob topilmadi");
  const password = genPassword();
  const { error } = await supabaseAdmin.auth.admin.updateUserById(acc.user_id as string, { password });
  if (error) throw new Error(error.message);
  return { login: acc.login as string, password };
}
