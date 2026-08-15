import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/* ------------------------------------------------------------------ *
 * First-run seeding (ADMIN_SETUP_SECRET bilan himoyalangan)
 * ------------------------------------------------------------------ */

/**
 * Tizim bo'sh bo'lsa 4 ta standart hisob yaratadi (admin/ustoz/o'quvchi/user).
 * Faqat ADMIN_SETUP_SECRET bilan chaqiriladi va mavjud loginlarni chetlab o'tadi.
 */
export const seedStarterAccounts = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        setupSecret: z.string().min(8).max(200),
        accounts: z
          .array(
            z.object({
              login: z.string().min(3).max(32),
              password: z.string().min(4).max(72),
              kind: z.enum(["admin", "teacher", "student", "user"]),
              fullName: z.string().max(80).optional(),
            }),
          )
          .min(1)
          .max(10),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const expected = process.env["ADMIN_SETUP_SECRET"];
    if (!expected || expected.length < 8) throw new Error("Sozlash o'chirilgan.");
    if (data.setupSecret !== expected) throw new Error("Sozlash kaliti noto'g'ri.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createAccount, normalizeLogin } = await import("./access.server");

    const out: { login: string; created: boolean }[] = [];
    for (const a of data.accounts) {
      const login = normalizeLogin(a.login);
      const { data: exists } = await supabaseAdmin
        .from("app_accounts")
        .select("id")
        .eq("login", login)
        .maybeSingle();
      if (exists) {
        out.push({ login, created: false });
        continue;
      }
      await createAccount({
        login,
        password: a.password,
        kind: a.kind,
        fullName: a.fullName ?? null,
        createdBy: null,
      });
      out.push({ login, created: true });
    }
    return { accounts: out };
  });

/* ------------------------------------------------------------------ *
 * Telegram orqali parolsiz kirish (push-approval)
 * ------------------------------------------------------------------ */

/**
 * Login kiritiladi → hisobga ulangan Telegram akkauntga
 * "Bu sizmi?" so'rovi yuboriladi. Parol kerak emas.
 */
export const requestTgLogin = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ login: z.string().min(3).max(40), device: z.string().max(200).optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { normalizeLogin } = await import("./access.server");
    const { sendMessage } = await import("./telegram.server");

    const login = normalizeLogin(data.login);
    const { data: acc } = await supabaseAdmin
      .from("app_accounts")
      .select("id, user_id, login, active, full_name")
      .eq("login", login)
      .maybeSingle();
    if (!acc) throw new Error("Bunday login topilmadi.");
    if (!acc.active) throw new Error("Bu hisob bloklangan. Admin bilan bog'laning.");

    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("telegram_id")
      .eq("user_id", acc.user_id as string)
      .maybeSingle();
    const chatId = prof?.telegram_id as number | null | undefined;
    if (!chatId)
      throw new Error(
        "Bu hisob Telegram botga ulanmagan. Admin/ustozingiz bergan havolani Telegramda bosing.",
      );

    // Eski kutayotgan so'rovlarni bekor qilamiz.
    await supabaseAdmin
      .from("login_requests")
      .update({ status: "cancelled" })
      .eq("account_id", acc.id as string)
      .eq("status", "pending");

    const { data: req, error } = await supabaseAdmin
      .from("login_requests")
      .insert({
        account_id: acc.id as string,
        device: data.device ?? null,
        expires_at: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await sendMessage(
      chatId,
      `🔐 <b>Kirish so'rovi</b>\n\nSaytga <code>${login}</code> hisobi bilan kirishga harakat qilinmoqda.${
        data.device ? `\nQurilma: <i>${data.device.slice(0, 120)}</i>` : ""
      }\n\nBu sizmi?`,
      {
        buttons: [
          [
            { text: "✅ Ha, bu men", callback_data: `la:${req.id}` },
            { text: "❌ Yo'q", callback_data: `ln:${req.id}` },
          ],
        ],
      },
    );

    return { requestId: req.id as string };
  });

/** Sayt har 2 sekundda holatni tekshiradi; tasdiqlangach kirish ma'lumotlarini oladi. */
export const pollTgLogin = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ requestId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { emailOf, logActivity, resetAccountPassword } = await import("./access.server");

    const { data: req } = await supabaseAdmin
      .from("login_requests")
      .select("id, account_id, status, expires_at")
      .eq("id", data.requestId)
      .maybeSingle();
    if (!req) return { status: "not_found" as const };

    if (req.status === "pending" && new Date(req.expires_at as string) < new Date()) {
      await supabaseAdmin.from("login_requests").update({ status: "expired" }).eq("id", req.id as string);
      return { status: "expired" as const };
    }
    if (req.status !== "approved") return { status: req.status as "pending" | "denied" | "expired" | "used" };

    const { data: acc } = await supabaseAdmin
      .from("app_accounts")
      .select("id, login, kind, full_name, active, user_id")
      .eq("id", req.account_id as string)
      .maybeSingle();
    if (!acc?.active) return { status: "denied" as const };

    // Bir marta ishlatiladi.
    await supabaseAdmin.from("login_requests").update({ status: "used" }).eq("id", req.id as string);
    const { password } = await resetAccountPassword(acc.id as string);
    await logActivity(acc.user_id as string, acc.login as string, "tg_login_approved");

    return {
      status: "ok" as const,
      email: emailOf(acc.login as string),
      password,
      kind: acc.kind as string,
      hasName: Boolean(acc.full_name),
    };
  });

/* ------------------------------------------------------------------ *
 * Ota-ona kuzatuv havolasi
 * ------------------------------------------------------------------ */

/** Admin/ustoz: o'quvchi uchun ota-ona kuzatuv havolasini yaratadi (eskisi o'chadi). */
export const issueParentLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ accountId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { requireKind, genToken } = await import("./access.server");
    await requireKind(context.userId, ["admin", "teacher"]);

    await supabaseAdmin
      .from("parent_links")
      .update({ active: false })
      .eq("account_id", data.accountId)
      .eq("active", true);

    const token = genToken();
    const { error } = await supabaseAdmin
      .from("parent_links")
      .insert({ account_id: data.accountId, token });
    if (error) throw new Error(error.message);

    let botUsername = process.env["TELEGRAM_BOT_USERNAME"] ?? null;
    if (!botUsername) {
      const t = process.env["TELEGRAM_BOT_TOKEN"];
      if (t) {
        try {
          const res = await fetch(`https://api.telegram.org/bot${t}/getMe`);
          const j = (await res.json()) as { result?: { username?: string } };
          botUsername = j.result?.username ?? null;
        } catch {
          /* ignore */
        }
      }
    }
    if (!botUsername) throw new Error("Bot sozlanmagan.");
    return { token, url: `https://t.me/${botUsername}?start=p_${token}` };
  });

/** Bot username — sayt Telegram tugmalari uchun. */
export const botUsernameFn = createServerFn({ method: "GET" }).handler(async () => {
  return { botUsername: process.env["TELEGRAM_BOT_USERNAME"] ?? null };
});

/* ------------------------------------------------------------------ *
 * 8 xonali kod bilan kirish (Telegram orqali)
 * ------------------------------------------------------------------ */

/** Login kiritiladi → botga 8 xonali bir martalik kod yuboriladi. */
export const requestTgCode = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ login: z.string().min(3).max(40) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { normalizeLogin } = await import("./access.server");
    const { sendMessage } = await import("./telegram.server");
    const { isBanned } = await import("./bot/security.server");
    const { clientIp } = await import("./req.server");

    const ip = clientIp();
    if (await isBanned(ip)) throw new Error("Bu qurilmadan kirish vaqtincha cheklangan.");

    const login = normalizeLogin(data.login);
    const { data: acc } = await supabaseAdmin
      .from("app_accounts")
      .select("id, user_id, active")
      .eq("login", login)
      .maybeSingle();
    if (!acc) throw new Error("Bunday login topilmadi.");
    if (!acc.active) throw new Error("Bu hisob bloklangan. Admin bilan bog'laning.");

    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("telegram_id")
      .eq("user_id", acc.user_id as string)
      .maybeSingle();
    const chatId = prof?.telegram_id as number | null | undefined;
    if (!chatId) throw new Error("Bu hisob Telegram botga ulanmagan.");

    await supabaseAdmin
      .from("tg_login_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("account_id", acc.id as string)
      .is("used_at", null);

    const bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    const code = String(
      10000000 + (((bytes[0]! << 24) | (bytes[1]! << 16) | (bytes[2]! << 8) | bytes[3]!) >>> 0) % 90000000,
    );

    const { error } = await supabaseAdmin.from("tg_login_codes").insert({
      account_id: acc.id as string,
      code,
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    });
    if (error) throw new Error(error.message);

    await sendMessage(
      chatId,
      `🔢 <b>Kirish kodi</b>\n\n<code>${code}</code>\n\nKod 5 daqiqa amal qiladi. Bu kodni hech kimga bermang!`,
    );
    return { ok: true as const };
  });

/** Sayt kiritilgan kodni tekshiradi va bir martalik kirish ma'lumotini qaytaradi. */
export const verifyTgCode = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ login: z.string().min(3).max(40), code: z.string().length(8) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { emailOf, logActivity, normalizeLogin, resetAccountPassword } = await import(
      "./access.server"
    );
    const { banIp, isBanned } = await import("./bot/security.server");
    const { clientIp } = await import("./req.server");

    const ip = clientIp();
    if (await isBanned(ip)) throw new Error("Bu qurilmadan kirish vaqtincha cheklangan.");

    const login = normalizeLogin(data.login);
    const { data: acc } = await supabaseAdmin
      .from("app_accounts")
      .select("id, login, kind, active, user_id, full_name")
      .eq("login", login)
      .maybeSingle();
    if (!acc?.active) throw new Error("Hisob topilmadi.");

    const { data: row } = await supabaseAdmin
      .from("tg_login_codes")
      .select("id, code, expires_at, used_at")
      .eq("account_id", acc.id as string)
      .is("used_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!row || new Date(row.expires_at as string) < new Date())
      throw new Error("Kod muddati tugadi. Qaytadan so'rang.");
    if (row.code !== data.code) {
      await logActivity(acc.user_id as string, acc.login as string, "kod_xato");
      await banIp(ip, 15, "Kod bir necha marta xato kiritildi");
      throw new Error("Kod noto'g'ri.");
    }

    await supabaseAdmin
      .from("tg_login_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("id", row.id as string);

    const { password } = await resetAccountPassword(acc.id as string);
    await logActivity(acc.user_id as string, acc.login as string, "kod_bilan_kirdi");

    return {
      status: "ok" as const,
      email: emailOf(acc.login as string),
      password,
      kind: acc.kind as string,
    };
  });

/* ------------------------------------------------------------------ *
 * Qurilma xavfsizligi
 * ------------------------------------------------------------------ */

/** Kirilgandan keyin qurilmani qayd etadi; rad etilgan qurilma bo'lsa `revoked`. */
export const registerDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ fingerprint: z.string().min(6).max(120), label: z.string().max(160).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { touchDevice } = await import("./bot/security.server");
    const { clientIp } = await import("./req.server");
    return touchDevice({
      userId: context.userId,
      fingerprint: data.fingerprint,
      label: data.label ?? null,
      ip: clientIp(),
    });
  });
