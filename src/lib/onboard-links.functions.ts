import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const KIND = z.enum(["admin", "teacher", "student", "user"]);

/**
 * Parolsiz hisob yaratish: admin faqat Ism + Familiya + rol kiritadi.
 * Login/parol foydalanuvchiga hech qachon ko'rsatilmaydi — u faqat
 * Telegram havolasi (`login_<token>`) orqali kiradi. O'quvchi bo'lsa,
 * qo'shimcha ota-ona kuzatuv havolasi (`parent_<token>`) ham beriladi.
 */
export const createLinkedAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        firstName: z.string().min(1).max(40),
        lastName: z.string().min(1).max(40),
        kind: KIND,
        groupId: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireKind, createAccount, genLogin, genPassword, logActivity } = await import(
      "./access.server"
    );
    const me = await requireKind(context.userId, ["admin"]);

    const first = data.firstName.trim();
    const last = data.lastName.trim();
    const fullName = `${first} ${last}`;

    const { account, token } = await createAccount({
      login: genLogin(`${first}${last}`),
      password: genPassword(),
      kind: data.kind,
      fullName,
      groupId: data.groupId ?? null,
      createdBy: context.userId,
    });

    await logActivity(context.userId, me.login, "hisob_yaratdi", `${fullName} (${account.kind})`);

    const links = await buildLinks(account.id, token, data.kind === "student");
    return { id: account.id, fullName, kind: data.kind, ...links };
  });

/** Mavjud hisob uchun havolalarni qaytadan chiqarish (eskisi darhol o'chadi). */
export const reissueAccountLinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ accountId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { requireKind, newLink } = await import("./access.server");
    await requireKind(context.userId, ["admin", "teacher"]);

    const { data: acc } = await supabaseAdmin
      .from("app_accounts")
      .select("id, kind, full_name")
      .eq("id", data.accountId)
      .maybeSingle();
    if (!acc) throw new Error("Hisob topilmadi");

    const token = await newLink(acc.id as string);
    const links = await buildLinks(acc.id as string, token, acc.kind === "student");
    return { id: acc.id as string, fullName: (acc.full_name as string) ?? "—", ...links };
  });

/** Admin/ustoz: barcha (yoki bitta guruh) hisoblarining havolalarini ommaviy chiqarish. */
export const exportAccountLinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ groupId: z.string().uuid().optional(), onlyUnused: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { requireKind, newLink } = await import("./access.server");
    await requireKind(context.userId, ["admin", "teacher"]);

    let q = supabaseAdmin.from("app_accounts").select("id, kind, full_name, login, user_id").eq("active", true);
    if (data.groupId) q = q.eq("group_id", data.groupId);
    const { data: accounts } = await q;

    const out: { fullName: string; loginUrl: string; parentUrl: string | null }[] = [];
    for (const a of accounts ?? []) {
      if (data.onlyUnused !== false) {
        const { data: prof } = await supabaseAdmin
          .from("profiles")
          .select("telegram_id")
          .eq("user_id", a.user_id as string)
          .maybeSingle();
        if (prof?.telegram_id) continue; // allaqachon bog'langan
      }
      const token = await newLink(a.id as string);
      const links = await buildLinks(a.id as string, token, a.kind === "student");
      out.push({
        fullName: (a.full_name as string) ?? (a.login as string),
        loginUrl: links.loginUrl,
        parentUrl: links.parentUrl,
      });
    }
    return { accounts: out };
  });

/* ------------------------------------------------------------------ */

async function buildLinks(accountId: string, loginToken: string, withParent: boolean) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { genToken } = await import("./access.server");
  const bot = await botUsername();

  let parentUrl: string | null = null;
  if (withParent) {
    await supabaseAdmin
      .from("parent_links")
      .update({ active: false })
      .eq("account_id", accountId)
      .eq("active", true);
    const ptoken = genToken();
    const { error } = await supabaseAdmin.from("parent_links").insert({ account_id: accountId, token: ptoken });
    if (error) throw new Error(error.message);
    parentUrl = `https://t.me/${bot}?start=parent_${ptoken}`;
  }

  return { loginUrl: `https://t.me/${bot}?start=login_${loginToken}`, parentUrl };
}

async function botUsername(): Promise<string> {
  let name = process.env["TELEGRAM_BOT_USERNAME"] ?? null;
  if (!name) {
    const t = process.env["TELEGRAM_BOT_TOKEN"];
    if (t) {
      try {
        const res = await fetch(`https://api.telegram.org/bot${t}/getMe`);
        const j = (await res.json()) as { result?: { username?: string } };
        name = j.result?.username ?? null;
      } catch {
        /* ignore */
      }
    }
  }
  if (!name) throw new Error("Bot sozlanmagan. Admin bilan bog'laning.");
  return name.replace(/^@/, "");
}
