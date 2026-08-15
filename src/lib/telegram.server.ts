// Low-level Telegram Bot API helpers. Server-only: the bot token never leaves
// this module and is always read inside the functions (Worker env is per-request).
import { createHash, timingSafeEqual } from "crypto";

const API = "https://api.telegram.org";

export function botToken(): string {
  const t = process.env["TELEGRAM_BOT_TOKEN"];
  if (!t) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  return t;
}

/** Secret token registered with setWebhook and verified on every incoming call. */
export function webhookSecret(): string {
  return createHash("sha256").update(`telegram-webhook:${botToken()}`).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function call<T = unknown>(method: string, body: Record<string, unknown>): Promise<T | null> {
  try {
    const res = await fetch(`${API}/bot${botToken()}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as { ok: boolean; result?: T; description?: string };
    if (!json.ok) {
      console.error(`Telegram ${method} failed [${res.status}]: ${json.description ?? ""}`);
      return null;
    }
    return json.result ?? null;
  } catch (e) {
    console.error(`Telegram ${method} error:`, e);
    return null;
  }
}

export type Button = { text: string; callback_data?: string; url?: string };

export function keyboard(rows: Button[][]) {
  return { inline_keyboard: rows };
}

export async function sendMessage(
  chatId: number | string,
  text: string,
  opts: {
    buttons?: Button[][];
    /** Bottom (reply) keyboard rows — plain button labels. */
    replyKeyboard?: string[][];
    removeKeyboard?: boolean;
    disablePreview?: boolean;
  } = {},
) {
  const markup = opts.buttons
    ? keyboard(opts.buttons)
    : opts.replyKeyboard
      ? { keyboard: opts.replyKeyboard.map((r) => r.map((t) => ({ text: t }))), resize_keyboard: true }
      : opts.removeKeyboard
        ? { remove_keyboard: true }
        : null;
  return call<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: opts.disablePreview ?? true,
    ...(markup ? { reply_markup: markup } : {}),
  });
}


export async function editMessage(
  chatId: number | string,
  messageId: number,
  text: string,
  buttons?: Button[][],
) {
  return call("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(buttons ? { reply_markup: keyboard(buttons) } : {}),
  });
}

export async function answerCallback(id: string, text?: string) {
  return call("answerCallbackQuery", { callback_query_id: id, ...(text ? { text } : {}) });
}

export async function sendChatAction(chatId: number | string, action = "typing") {
  return call("sendChatAction", { chat_id: chatId, action });
}

export async function setCommands(commands: { command: string; description: string }[]) {
  return call("setMyCommands", { commands });
}

/** Per-chat command list — lets each role see only its own commands. */
export async function setChatCommands(
  chatId: number | string,
  commands: { command: string; description: string }[],
) {
  return call("setMyCommands", { commands, scope: { type: "chat", chat_id: chatId } });
}


export async function setWebhook(url: string) {
  return call("setWebhook", {
    url,
    secret_token: webhookSecret(),
    allowed_updates: ["message", "edited_message", "callback_query"],
  });
}

export async function getWebhookInfo() {
  return call<Record<string, unknown>>("getWebhookInfo", {});
}

/** Download a user-sent file (voice, photo) as bytes. */
export async function downloadFile(fileId: string): Promise<ArrayBuffer | null> {
  const info = await call<{ file_path: string }>("getFile", { file_id: fileId });
  if (!info?.file_path) return null;
  const res = await fetch(`${API}/file/bot${botToken()}/${info.file_path}`);
  if (!res.ok) return null;
  return res.arrayBuffer();
}

export function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
