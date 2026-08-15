// Ro'yxatdan o'tmagan (hech qanday hisobga bog'lanmagan) Telegram foydalanuvchilari
// uchun oqim: faqat /royxatdanotish buyrug'i ko'rinadi, keyin saytga havola,
// 15 soniyadan so'ng login/parol so'rovi, so'ng hisobni bog'lash.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createClient } from "@supabase/supabase-js";
import { esc, sendMessage, setChatCommands, type Button } from "@/lib/telegram.server";
import { clearState, getState, setState, SITE_URL } from "./core.server";
import { ADMIN_CONTACT, emailOf } from "@/lib/auth-config";

export const REGISTER_CMD = "/royxatdanotish";

export const ONLY_REGISTER_HINT = `Botdan foydalanish uchun avval ro'yxatdan o'ting: ${REGISTER_CMD}`;

export async function syncUnregisteredCommands(chatId: number) {
  await setChatCommands(chatId, [
    { command: "royxatdanotish", description: "Ro'yxatdan o'tish / hisobni ulash" },
  ]);
}

function helpButton(): Button[][] {
  return [[{ text: "❓ Login/parolni ololmadim", callback_data: "reg:help" }]];
}

const CREDS_PROMPT = `Endi login va parolingizni kiriting. Avval loginni, keyin bo'sh qatordan so'ng parolni yozing:

<code>login
parol</code>

Masalan:
<code>alisher01
7f3k9d2a</code>`;

/** Havola + 15 soniyadan keyingi ko'rsatma. */
export async function startRegistration(chatId: number) {
  await syncUnregisteredCommands(chatId);
  await setState(chatId, { mode: "reg" });
  await sendMessage(
    chatId,
    `📝 <b>Ro'yxatdan o'tish</b>\n\nRo'yxatdan o'tish uchun saytga o'ting: ${SITE_URL}/auth\n\nU yerda login ma'lumotlaringizni administratordan olishingiz kerak bo'ladi.`,
    { buttons: [[{ text: "🌐 Saytga o'tish", url: `${SITE_URL}/auth` }]] },
  );
  await new Promise((r) => setTimeout(r, 15000));
  const st = await getState(chatId);
  if (st["mode"] !== "reg") return; // foydalanuvchi allaqachon ulangan
  await sendMessage(chatId, CREDS_PROMPT, { buttons: helpButton() });
}

export async function registrationHelp(chatId: number) {
  return void sendMessage(
    chatId,
    `👨‍💻 Administrator bilan bog'lanish uchun: https://t.me/${ADMIN_CONTACT.telegram}\n\nUnga shunday deb yozishingiz mumkin:\n\n<i>“Assalomu alaykum! Linny AI botiga ulanmoqchiman, lekin login va parolim yo'q. Yordam bera olasizmi?”</i>`,
    { buttons: [[{ text: "✍️ Adminga yozish", url: `https://t.me/${ADMIN_CONTACT.telegram}` }]] },
  );
}

function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

/** "login\nparol" ko'rinishidagi xabarni tekshirib, Telegramni hisobga bog'laydi. */
export async function tryCredentialLink(
  chatId: number,
  username: string | undefined,
  text: string,
): Promise<boolean> {
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return false;
  const [login, password] = [lines[0]!, lines[1]!];

  const { data: acc } = await supabaseAdmin
    .from("app_accounts")
    .select("id, user_id, login, kind, full_name, active")
    .eq("login", login.toLowerCase().replace(/['’‘`\s]/g, ""))
    .maybeSingle();
  if (!acc) {
    await sendMessage(chatId, "❌ Bunday login topilmadi. Qaytadan tekshirib yuboring.", {
      buttons: helpButton(),
    });
    return true;
  }
  if (!acc.active) {
    await sendMessage(chatId, "❌ Bu hisob bloklangan. Administrator bilan bog'laning.", {
      buttons: helpButton(),
    });
    return true;
  }

  const { error } = await publicClient().auth.signInWithPassword({
    email: emailOf(acc.login as string),
    password,
  });
  if (error) {
    await sendMessage(chatId, "❌ Parol noto'g'ri. Qaytadan yuboring.", { buttons: helpButton() });
    return true;
  }

  const { data: taken } = await supabaseAdmin
    .from("profiles")
    .select("user_id")
    .eq("telegram_id", chatId)
    .maybeSingle();
  if (taken && taken.user_id !== acc.user_id) {
    await sendMessage(chatId, "⚠️ Bu Telegram akkaunt boshqa hisobga ulangan.");
    return true;
  }

  await supabaseAdmin
    .from("profiles")
    .update({
      telegram_id: chatId,
      telegram_username: username ?? null,
      telegram_linked_at: new Date().toISOString(),
    })
    .eq("user_id", acc.user_id as string);
  await clearState(chatId);
  await sendMessage(
    chatId,
    `✅ Hisobingiz ulandi${acc.full_name ? `, <b>${esc(String(acc.full_name).split(" ")[0]!)}</b>` : ""}!\n\nEndi /menu orqali botdan foydalanishingiz mumkin.`,
  );
  return true;
}

/** Hech qanday rolga bog'lanmagan foydalanuvchi uchun yagona kirish nuqtasi. */
export async function handleUnregistered(
  chatId: number,
  username: string | undefined,
  text: string,
): Promise<void> {
  const cmd = text.split(/\s+/)[0]?.toLowerCase() ?? "";
  if (cmd === REGISTER_CMD || cmd === "/register" || text === "📝 Ro'yxatdan o'tish") {
    return startRegistration(chatId);
  }
  if (await tryCredentialLink(chatId, username, text)) return;
  await syncUnregisteredCommands(chatId);
  return void sendMessage(chatId, ONLY_REGISTER_HINT, {
    buttons: [[{ text: "📝 Ro'yxatdan o'tish", callback_data: "reg:start" }]],
  });
}
