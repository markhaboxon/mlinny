// Shared server-only helpers for the Telegram bot: identity, state, AI access.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getGateway } from "@/lib/ai-gateway.server";
import { AI_MODEL } from "@/lib/ai-model";
import { generateText } from "ai";

export const SITE_URL = process.env["SITE_URL"]?.trim() || "https://lingo-pal.lovable.app";

export type BotUser = {
  userId: string;
  chatId: number;
  name: string | null;
  kind: "admin" | "teacher" | "student" | "user";
  level: string | null;
  streak: number;
  tgDailyHour: number;
  tgReminders: boolean;
};

export async function findUserByChat(chatId: number): Promise<BotUser | null> {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("user_id, name, level_chosen, streak, tg_daily_hour, tg_reminders")
    .eq("telegram_id", chatId)
    .maybeSingle();
  if (!profile) return null;
  const { data: acc } = await supabaseAdmin
    .from("app_accounts")
    .select("kind, full_name")
    .eq("user_id", profile.user_id)
    .maybeSingle();
  return {
    userId: profile.user_id,
    chatId,
    name: profile.name ?? acc?.full_name ?? null,
    kind: (acc?.kind as BotUser["kind"]) ?? "student",
    level: profile.level_chosen,
    streak: profile.streak ?? 0,
    tgDailyHour: profile.tg_daily_hour ?? 8,
    tgReminders: profile.tg_reminders ?? true,
  };
}

export async function chatIdOfUser(userId: string): Promise<number | null> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("telegram_id")
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.telegram_id as number | null) ?? null;
}

// --- conversation state -----------------------------------------------------
export type BotState = Record<string, unknown>;

export async function getState(chatId: number): Promise<BotState> {
  const { data } = await supabaseAdmin
    .from("telegram_state")
    .select("data")
    .eq("chat_id", chatId)
    .maybeSingle();
  return ((data?.data as BotState) ?? {}) as BotState;
}

export async function setState(chatId: number, patch: BotState) {
  const current = await getState(chatId);
  const next = { ...current, ...patch };
  await supabaseAdmin
    .from("telegram_state")
    .upsert({ chat_id: chatId, data: next as never, updated_at: new Date().toISOString() }, { onConflict: "chat_id" });
  return next;
}

export async function clearState(chatId: number, keys?: string[]) {
  if (!keys) {
    await supabaseAdmin.from("telegram_state").delete().eq("chat_id", chatId);
    return;
  }
  const current = await getState(chatId);
  for (const k of keys) delete current[k];
  await supabaseAdmin
    .from("telegram_state")
    .upsert({ chat_id: chatId, data: current as never, updated_at: new Date().toISOString() }, { onConflict: "chat_id" });
}

// --- AI ---------------------------------------------------------------------
// Small in-memory cache so identical prompts do not burn extra Gemini quota.
const aiCache = new Map<string, { text: string; at: number }>();
const AI_CACHE_MS = 6 * 60 * 60 * 1000;

export async function ai(
  userId: string | undefined,
  system: string,
  prompt: string,
  opts: { cacheKey?: string; maxTokens?: number } = {},
): Promise<string> {
  const key = opts.cacheKey;
  if (key) {
    const hit = aiCache.get(key);
    if (hit && Date.now() - hit.at < AI_CACHE_MS) return hit.text;
  }
  try {
    const gw = getGateway(userId);
    const { text } = await generateText({
      model: gw(AI_MODEL),
      system,
      prompt,
      maxOutputTokens: opts.maxTokens ?? 600,
    });
    const out = text.trim();
    if (key && out) aiCache.set(key, { text: out, at: Date.now() });
    return out;
  } catch (e) {
    console.error("bot ai error", e);
    return "🤖 Hozir AI band. Iltimos, bir-ikki daqiqadan keyin qayta urinib ko'ring.";
  }
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Runs a job at most once per key (used by the scheduler). */
export async function claimJob(jobKey: string): Promise<boolean> {
  const { error } = await supabaseAdmin.from("bot_jobs").insert({ job_key: jobKey });
  return !error;
}
