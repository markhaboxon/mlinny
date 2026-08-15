import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export const ALL_KEYS_EXHAUSTED = "ALL_KEYS_EXHAUSTED";

// ---------------------------------------------------------------------------
// Key pool (0-band: no key is ever hardcoded here)
// ---------------------------------------------------------------------------
// Keys come from two sources only:
//  1. Server environment secrets GEMINI_API_KEY, GEMINI_API_KEY_2..GEMINI_API_KEY_20
//  2. Keys users connect from the app (public.gemini_keys), loaded with the
//     service-role client so key values never reach the browser.
const RATE_LIMIT_COOLDOWN_MS = 65_000; // Gemini free-tier limits reset per minute.
const INVALID_KEY_COOLDOWN_MS = 30 * 60_000;
const cooldown = new Map<string, number>();

type DbKey = { id: string; key: string; owner: string | null; scope: string };
let dbKeysCache: { keys: DbKey[]; at: number } = { keys: [], at: 0 };
const DB_CACHE_MS = 20_000;

// B2 — round-robin cursor so concurrent requests do not all start at key #1.
let rrCursor = 0;

function envKeys(): string[] {
  const names = ["GEMINI_API_KEY"];
  for (let i = 2; i <= 20; i++) names.push(`GEMINI_API_KEY_${i}`);
  return names
    .map((n) => process.env[n])
    .filter((v): v is string => !!v && v.trim().length > 10)
    .map((v) => v.trim());
}

async function dbKeys(): Promise<DbKey[]> {
  const now = Date.now();
  if (now - dbKeysCache.at < DB_CACHE_MS) return dbKeysCache.keys;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("gemini_keys")
      .select("id, api_key, added_by, owner_id, scope")
      .eq("active", true)
      .order("created_at", { ascending: true });
    const keys = (data ?? [])
      .filter((r) => !!r.api_key)
      .map((r) => ({
        id: r.id as string,
        key: r.api_key as string,
        owner: (r.owner_id as string | null) ?? (r.added_by as string | null) ?? null,
        scope: (r.scope as string | null) ?? "global",
      }));
    dbKeysCache = { keys, at: now };
    return keys;
  } catch {
    dbKeysCache = { keys: dbKeysCache.keys, at: now };
    return dbKeysCache.keys;
  }
}

/** Kalit muvaffaqiyatli ishladi — statistikani yangilaydi (admin paneli uchun). */
async function recordOk(key: string) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabaseAdmin
      .from("gemini_keys")
      .select("id, calls_today, calls_total, calls_day")
      .eq("api_key", key)
      .maybeSingle();
    if (!data) return;
    const sameDay = data.calls_day === today;
    await supabaseAdmin
      .from("gemini_keys")
      .update({
        calls_today: (sameDay ? (data.calls_today ?? 0) : 0) + 1,
        calls_total: (data.calls_total ?? 0) + 1,
        calls_day: today,
        last_ok_at: new Date().toISOString(),
        last_error: null,
        cooldown_until: null,
      })
      .eq("id", data.id as string);
  } catch {
    /* statistika muhim emas — asosiy oqim to'xtamaydi */
  }
}

/** Kalitda xatolik/limit — sabab va kutish vaqti yozib qo'yiladi. */
async function recordError(key: string, message: string, until: number) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("gemini_keys")
      .update({ last_error: message.slice(0, 300), cooldown_until: new Date(until).toISOString() })
      .eq("api_key", key);
  } catch {
    /* ignore */
  }
}


export function markKeyExhausted(key: string, duration = RATE_LIMIT_COOLDOWN_MS) {
  cooldown.set(key, Date.now() + duration);
}

/**
 * Called right after a user connects a new key: forget the cached DB key list
 * and clear every cooldown so the fresh key is usable immediately.
 */
export function invalidateKeyCache(newKey?: string) {
  dbKeysCache = { keys: [], at: 0 };
  cooldown.clear();
  if (newKey) cooldown.delete(newKey);
}

function isCooling(key: string) {
  const until = cooldown.get(key);
  if (!until) return false;
  if (until <= Date.now()) {
    cooldown.delete(key);
    return false;
  }
  return true;
}

/** Faqat umumiy (admin qo'shgan / env) kalitlar + `userId`ning shaxsiy kalitlari. */
async function usableKeys(userId?: string): Promise<{ personal: string[]; shared: string[] }> {
  const db = await dbKeys();
  const personal = userId
    ? db.filter((k) => k.scope === "user" && k.owner === userId).map((k) => k.key)
    : [];
  const shared = Array.from(
    new Set([...envKeys(), ...db.filter((k) => k.scope !== "user").map((k) => k.key)]),
  ).filter((k) => !personal.includes(k));
  return { personal, shared };
}

export async function allKeys(userId?: string): Promise<string[]> {
  const { personal, shared } = await usableKeys(userId);
  return Array.from(new Set([...personal, ...shared]));
}

export async function keyPoolInfo(userId?: string) {
  const keys = await allKeys(userId);
  const available = keys.filter((k) => !isCooling(k));
  return { total: keys.length, available: available.length };
}

/**
 * B2 + B3 — build the try-order for one request:
 *  1. the caller's own connected keys first (personal keys are private to them),
 *  2. then the shared pool rotated round-robin so parallel requests spread out.
 */
async function orderedKeys(userId?: string): Promise<{ order: string[]; total: number }> {
  const { personal, shared } = await usableKeys(userId);

  const start = shared.length > 0 ? rrCursor++ % shared.length : 0;
  const rotated = [...shared.slice(start), ...shared.slice(0, start)];

  const total = new Set([...personal, ...shared]).size;
  const order = [...personal, ...rotated].filter((k) => !isCooling(k));
  return { order: Array.from(new Set(order)), total };
}


// ---------------------------------------------------------------------------
// Rotating fetch: B4 — a failing key is swapped for the next working one
// silently; the user only sees an error when every key is unusable.
// ---------------------------------------------------------------------------
async function parseError(res: Response) {
  const text = await res
    .clone()
    .text()
    .catch(() => "");
  try {
    const j = JSON.parse(text);
    return (j?.error?.message || j?.message || "") as string;
  } catch {
    return text.slice(0, 200);
  }
}

function createRotatingFetch(userId?: string): typeof fetch {
  return async (input, init) => {
    const { order, total } = await orderedKeys(userId);
    if (total === 0) throw new Error("Missing GEMINI_API_KEY");

    if (order.length === 0) {
      throw new Error(
        `${ALL_KEYS_EXHAUSTED}: Barcha ulangan API kalitlari vaqtincha kutish rejimida (${total} ta kalit). 1-2 daqiqadan keyin qayta urinib ko'ring.`,
      );
    }

    let lastMessage = "";
    for (const key of order) {
      const headers = new Headers(init?.headers);
      headers.set("Authorization", `Bearer ${key}`);
      let res: Response;
      try {
        res = await fetch(input, { ...init, headers });
      } catch (e) {
        lastMessage = e instanceof Error ? e.message : String(e);
        continue;
      }

      if (res.ok) {
        cooldown.delete(key);
        void recordOk(key);
        return res;
      }

      const message = await parseError(res);
      lastMessage = message;

      if (res.status === 429 || /quota|resource_exhausted|rate limit/i.test(message)) {
        markKeyExhausted(key);
        void recordError(key, message || "Limit tugadi (429)", Date.now() + RATE_LIMIT_COOLDOWN_MS);
        continue; // try the next key
      }
      if (res.status === 401 || res.status === 403) {
        markKeyExhausted(key, INVALID_KEY_COOLDOWN_MS);
        void recordError(key, message || `Kalit qabul qilinmadi (${res.status})`, Date.now() + INVALID_KEY_COOLDOWN_MS);
        continue; // bad/expired key — skip it and try another
      }

      if (res.status === 402) {
        throw new Error("Gemini hisobida to'lov muammosi bor.");
      }
      if (res.status >= 500) {
        // Transient Gemini overload (503) — short pause, then try the next key.
        lastMessage = message || `Server vaqtincha band (${res.status})`;
        await new Promise((r) => setTimeout(r, 700));
        continue;
      }
      throw new Error(`AI xatosi (${res.status}): ${message || "noma'lum"}`);
    }

    if (lastMessage && !/quota|resource_exhausted|rate limit/i.test(lastMessage)) {
      throw new Error(
        "Gemini serveri hozir juda band (503). Iltimos, 10-20 soniyadan keyin qayta urinib ko'ring.",
      );
    }

    throw new Error(
      `${ALL_KEYS_EXHAUSTED}: Barcha ulangan API kalitlarida limit tugadi (${total} ta kalit). Yangi API kalit ulang yoki 1-2 daqiqa kutib qayta urinib ko'ring.`,
    );
  };
}

// Gemini exposes an OpenAI-compatible endpoint at
// https://generativelanguage.googleapis.com/v1beta/openai/
export function createGeminiProvider(userId?: string) {
  return createOpenAICompatible({
    name: "gemini",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    // Placeholder; the rotating fetch overrides Authorization per attempt.
    headers: { Authorization: "Bearer rotating" },
    fetch: createRotatingFetch(userId),
  });
}

/** `userId` (optional) makes the caller's own connected key be tried first. */
export function getGateway(userId?: string) {
  return createGeminiProvider(userId);
}

// Validate a user-supplied key with one cheap request.
export async function validateGeminiKey(key: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/models", {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (res.ok) return { ok: true };
    if (res.status === 429) return { ok: true }; // valid key, just rate limited right now
    const message = await parseError(res);
    return { ok: false, error: message || `Kalit tekshiruvi muvaffaqiyatsiz (${res.status})` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Kalitni tekshirib bo'lmadi" };
  }
}

// ---------------------------------------------------------------------------
// Admin: to'liq kalitlar hisoboti
// ---------------------------------------------------------------------------
export function maskKey(key: string) {
  if (key.length <= 10) return "••••";
  return `${key.slice(0, 6)}••••${key.slice(-4)}`;
}

/** Gemini kunlik limiti Tinch okeani yarim tunida (00:00 PT) qayta tiklanadi. */
export function nextDailyReset(): string {
  const now = new Date();
  // PT = UTC-8 (qishda) — kunlik limit uchun yetarli aniqlik.
  const ptNow = new Date(now.getTime() - 8 * 3600_000);
  const next = new Date(
    Date.UTC(ptNow.getUTCFullYear(), ptNow.getUTCMonth(), ptNow.getUTCDate() + 1, 0, 0, 0),
  );
  return new Date(next.getTime() + 8 * 3600_000).toISOString();
}

export type KeyReportRow = {
  id: string;
  masked: string;
  label: string | null;
  scope: string;
  ownerName: string | null;
  active: boolean;
  status: "ishlayapti" | "kutish rejimida" | "o'chirilgan" | "hali ishlatilmagan";
  cooldownUntil: string | null;
  minuteResetIn: number | null;
  callsToday: number;
  callsTotal: number;
  lastOkAt: string | null;
  lastError: string | null;
  createdAt: string;
};

export async function keysReport(): Promise<{
  envKeys: number;
  rows: KeyReportRow[];
  dailyResetAt: string;
  minuteWindowSec: number;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("gemini_keys")
    .select(
      "id, api_key, label, scope, owner_id, added_by, active, created_at, calls_today, calls_total, calls_day, last_ok_at, last_error, cooldown_until",
    )
    .order("created_at", { ascending: true });

  const rows = data ?? [];
  const ownerIds = Array.from(
    new Set(rows.map((r) => (r.owner_id as string | null) ?? (r.added_by as string | null)).filter(Boolean)),
  ) as string[];
  const names = new Map<string, string>();
  if (ownerIds.length) {
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("user_id, name")
      .in("user_id", ownerIds);
    for (const p of profs ?? []) names.set(p.user_id as string, (p.name as string | null) ?? "—");
  }

  const today = new Date().toISOString().slice(0, 10);
  const out: KeyReportRow[] = rows.map((r) => {
    const key = r.api_key as string;
    const until = cooldown.get(key) ?? (r.cooldown_until ? Date.parse(r.cooldown_until as string) : 0);
    const cooling = until > Date.now();
    const owner = (r.owner_id as string | null) ?? (r.added_by as string | null);
    return {
      id: r.id as string,
      masked: maskKey(key),
      label: (r.label as string | null) ?? null,
      scope: (r.scope as string | null) ?? "global",
      ownerName: owner ? (names.get(owner) ?? "—") : null,
      active: !!r.active,
      status: !r.active
        ? "o'chirilgan"
        : cooling
          ? "kutish rejimida"
          : r.last_ok_at
            ? "ishlayapti"
            : "hali ishlatilmagan",
      cooldownUntil: cooling ? new Date(until).toISOString() : null,
      minuteResetIn: cooling ? Math.max(0, Math.round((until - Date.now()) / 1000)) : null,
      callsToday: r.calls_day === today ? ((r.calls_today as number) ?? 0) : 0,
      callsTotal: (r.calls_total as number) ?? 0,
      lastOkAt: (r.last_ok_at as string | null) ?? null,
      lastError: (r.last_error as string | null) ?? null,
      createdAt: r.created_at as string,
    };
  });

  return {
    envKeys: envKeys().length,
    rows: out,
    dailyResetAt: nextDailyReset(),
    minuteWindowSec: Math.round(RATE_LIMIT_COOLDOWN_MS / 1000),
  };
}

/**
 * Kalit rotatsiyasi bilan ishlaydigan xom `fetch` — Gemini'ning
 * OpenAI-mos endpointiga to'g'ridan-to'g'ri so'rov yuborish kerak bo'lganda
 * (masalan IELTS Speaking audio tahlili) ishlatiladi.
 */
export function gatewayFetch(userId?: string): typeof fetch {
  return createRotatingFetch(userId);
}
