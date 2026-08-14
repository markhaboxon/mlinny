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

type DbKey = { key: string; owner: string | null; shared: boolean };
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
    const [{ data }, { data: admins }] = await Promise.all([
      supabaseAdmin
        .from("gemini_keys")
        .select("api_key, added_by")
        .eq("active", true)
        .order("created_at", { ascending: true }),
      supabaseAdmin.from("app_accounts").select("user_id").eq("kind", "admin"),
    ]);
    const adminIds = new Set(
      (admins ?? []).map((a) => a.user_id).filter((v): v is string => typeof v === "string"),
    );
    const keys = (data ?? [])
      .filter((r) => !!r.api_key)
      .map((r) => {
        const owner = (r.added_by as string | null) ?? null;
        // Only admin-connected (or env) keys are shared with everyone;
        // a key a student connects is used for that student only.
        return { key: r.api_key as string, owner, shared: !owner || adminIds.has(owner) };
      });
    dbKeysCache = { keys, at: now };
    return keys;
  } catch {
    dbKeysCache = { keys: dbKeysCache.keys, at: now };
    return dbKeysCache.keys;
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

/** Cooldown end timestamp (ms) for a key, or null when it is ready to use. */
export function cooldownUntil(key: string): number | null {
  const until = cooldown.get(key);
  return until && until > Date.now() ? until : null;
}

export async function allKeys(): Promise<string[]> {
  const keys = [...envKeys(), ...(await dbKeys()).map((k) => k.key)];
  return Array.from(new Set(keys));
}

/** Pool size as seen by one user: shared keys + that user's own keys. */
export async function keyPoolInfo(userId?: string) {
  const db = await dbKeys();
  const usable = Array.from(
    new Set([
      ...envKeys(),
      ...db.filter((k) => k.shared || (userId && k.owner === userId)).map((k) => k.key),
    ]),
  );
  return { total: usable.length, available: usable.filter((k) => !isCooling(k)).length };
}

/**
 * B2 + B3 — build the try-order for one request:
 *  1. the caller's own connected keys first (personal keys before the shared pool),
 *  2. then the shared pool rotated round-robin so parallel requests spread out.
 * Personal keys of *other* users are never used.
 */
async function orderedKeys(userId?: string): Promise<{ order: string[]; total: number }> {
  const db = await dbKeys();
  const personal = userId ? db.filter((k) => k.owner === userId).map((k) => k.key) : [];
  const shared = Array.from(
    new Set([
      ...envKeys(),
      ...db.filter((k) => k.shared && !personal.includes(k.key)).map((k) => k.key),
    ]),
  );

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
        return res;
      }

      const message = await parseError(res);
      lastMessage = message;

      if (res.status === 429 || /quota|resource_exhausted|rate limit/i.test(message)) {
        markKeyExhausted(key);
        continue; // try the next key
      }
      if (res.status === 401 || res.status === 403) {
        markKeyExhausted(key, INVALID_KEY_COOLDOWN_MS);
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
// Admin view of the pool
// ---------------------------------------------------------------------------
export type KeyReport = {
  id: string | null;
  masked: string;
  label: string | null;
  source: "env" | "db";
  scope: "umumiy" | "shaxsiy";
  ownerId: string | null;
  active: boolean;
  createdAt: string | null;
  cooldownUntil: string | null;
  status: "ok" | "limit" | "invalid" | "unknown";
  statusText: string;
};

export function maskKey(key: string) {
  return key.length <= 12 ? `${key.slice(0, 4)}…` : `${key.slice(0, 8)}…${key.slice(-4)}`;
}

/** Full picture of every key in the system, optionally live-checked at Google. */
export async function keyReport(live: boolean): Promise<KeyReport[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: rows }, { data: admins }] = await Promise.all([
    supabaseAdmin
      .from("gemini_keys")
      .select("id, api_key, label, added_by, active, created_at")
      .order("created_at", { ascending: true }),
    supabaseAdmin.from("app_accounts").select("user_id, login, kind"),
  ]);
  const accounts = new Map((admins ?? []).map((a) => [a.user_id as string, a]));

  const items: (KeyReport & { raw: string })[] = [];

  for (const k of envKeys()) {
    items.push({
      raw: k,
      id: null,
      masked: maskKey(k),
      label: "Server sozlamasi (env)",
      source: "env",
      scope: "umumiy",
      ownerId: null,
      active: true,
      createdAt: null,
      cooldownUntil: null,
      status: "unknown",
      statusText: "",
    });
  }

  for (const r of rows ?? []) {
    const owner = (r.added_by as string | null) ?? null;
    const acc = owner ? accounts.get(owner) : undefined;
    const isAdmin = !owner || acc?.kind === "admin";
    items.push({
      raw: r.api_key as string,
      id: r.id as string,
      masked: maskKey(r.api_key as string),
      label: (r.label as string | null) ?? (acc ? `${acc.login} (${acc.kind})` : null),
      source: "db",
      scope: isAdmin ? "umumiy" : "shaxsiy",
      ownerId: owner,
      active: Boolean(r.active),
      createdAt: (r.created_at as string | null) ?? null,
      cooldownUntil: null,
      status: "unknown",
      statusText: "",
    });
  }

  const out: KeyReport[] = [];
  for (const it of items) {
    const until = cooldownUntil(it.raw);
    let status: KeyReport["status"] = until ? "limit" : "ok";
    let statusText = until
      ? `Limit tugagan — ${new Date(until).toLocaleTimeString("uz-UZ")} da qayta ochiladi`
      : "Ishlayapti";

    if (live) {
      const check = await validateGeminiKey(it.raw);
      if (!check.ok) {
        status = "invalid";
        statusText = check.error ?? "Kalit ishlamayapti";
      } else if (!until) {
        status = "ok";
        statusText = "Ishlayapti (tekshirildi)";
      }
    }

    out.push({
      id: it.id,
      masked: it.masked,
      label: it.label,
      source: it.source,
      scope: it.scope,
      ownerId: it.ownerId,
      active: it.active,
      createdAt: it.createdAt,
      cooldownUntil: until ? new Date(until).toISOString() : null,
      status,
      statusText,
    });
  }
  return out;
}
