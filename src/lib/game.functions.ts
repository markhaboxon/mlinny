/**
 * BO'LIM D — O'yin iqtisodi: tangalar, do'kon, streak muzlatkich va ligalar.
 *
 * Muhim xavfsizlik qoidasi: tanga, xarid va liga hisob-kitobi HECH QACHON
 * brauzerda bajarilmaydi. Har bir amal `SECURITY DEFINER` bazaviy funksiya
 * orqali o'tadi, u foydalanuvchini `auth.uid()` bo'yicha aniqlaydi va
 * miqdorlarni cheklaydi. Shu sababli mijoz tomonidan "1 000 000 tanga"
 * yuborib bo'lmaydi.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type ShopItem = {
  code: string;
  kind: "freeze" | "avatar" | "theme";
  title: string;
  description: string | null;
  emoji: string | null;
  price: number;
  payload: string | null;
  owned: boolean;
  equipped: boolean;
};

export type GameState = {
  coins: number;
  streak: number;
  bestStreak: number;
  freezes: number;
  weeklyXp: number;
  totalXp: number;
  league: string;
  avatarCode: string | null;
  themeCode: string | null;
};

const LEAGUES = ["bronze", "silver", "gold", "diamond"] as const;

function normaliseLeague(v: unknown): string {
  const s = typeof v === "string" ? v : "bronze";
  return (LEAGUES as readonly string[]).includes(s) ? s : "bronze";
}

export const getGameState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<GameState> => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("coins, streak, best_streak, streak_freezes, weekly_xp, total_xp, league, avatar_code, theme_code")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw error;
    const r = (data ?? {}) as Record<string, unknown>;
    return {
      coins: Number(r.coins ?? 0),
      streak: Number(r.streak ?? 0),
      bestStreak: Number(r.best_streak ?? 0),
      freezes: Number(r.streak_freezes ?? 0),
      weeklyXp: Number(r.weekly_xp ?? 0),
      totalXp: Number(r.total_xp ?? 0),
      league: normaliseLeague(r.league),
      avatarCode: (r.avatar_code as string | null) ?? null,
      themeCode: (r.theme_code as string | null) ?? null,
    };
  });

/**
 * Mashqdan keyin XP va tanga qo'shish. Miqdorlar bazada ham cheklanadi
 * (bir chaqiruvda maksimum 200 XP / 200 tanga), shuning uchun mijozdagi
 * har qanday o'zgartirish foydasiz.
 */
export const awardProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        reason: z.string().min(1).max(60),
        xp: z.number().int().min(0).max(200),
        coins: z.number().int().min(0).max(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("award_progress", {
      _reason: data.reason,
      _xp: data.xp,
      _coins: data.coins,
    });
    if (error) throw error;
    const r = (Array.isArray(rows) ? rows[0] : rows) as Record<string, unknown> | null;
    return {
      coins: Number(r?.coins ?? 0),
      weeklyXp: Number(r?.weekly_xp ?? 0),
      totalXp: Number(r?.total_xp ?? 0),
      league: normaliseLeague(r?.league),
    };
  });

export const listShop = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ items: ShopItem[]; state: GameState }> => {
    const [itemsRes, ownedRes, profRes] = await Promise.all([
      context.supabase.from("shop_items").select("*").eq("active", true).order("sort"),
      context.supabase.from("user_purchases").select("item_code"),
      context.supabase
        .from("profiles")
        .select("coins, streak, best_streak, streak_freezes, weekly_xp, total_xp, league, avatar_code, theme_code")
        .eq("user_id", context.userId)
        .maybeSingle(),
    ]);
    if (itemsRes.error) throw itemsRes.error;

    const owned = new Set((ownedRes.data ?? []).map((r) => r.item_code as string));
    const p = (profRes.data ?? {}) as Record<string, unknown>;
    const state: GameState = {
      coins: Number(p.coins ?? 0),
      streak: Number(p.streak ?? 0),
      bestStreak: Number(p.best_streak ?? 0),
      freezes: Number(p.streak_freezes ?? 0),
      weeklyXp: Number(p.weekly_xp ?? 0),
      totalXp: Number(p.total_xp ?? 0),
      league: normaliseLeague(p.league),
      avatarCode: (p.avatar_code as string | null) ?? null,
      themeCode: (p.theme_code as string | null) ?? null,
    };

    const items: ShopItem[] = (itemsRes.data ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      const code = row.code as string;
      const kind = row.kind as ShopItem["kind"];
      return {
        code,
        kind,
        title: row.title as string,
        description: (row.description as string | null) ?? null,
        emoji: (row.emoji as string | null) ?? null,
        price: Number(row.price ?? 0),
        payload: (row.payload as string | null) ?? null,
        owned: kind === "freeze" ? false : owned.has(code) || Number(row.price ?? 0) === 0,
        equipped:
          kind === "avatar" ? state.avatarCode === code : kind === "theme" ? state.themeCode === code : false,
      };
    });

    return { items, state };
  });

export const buyShopItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ code: z.string().min(1).max(60) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("buy_shop_item", { _code: data.code });
    if (error) throw error;
    return (res ?? { ok: false, error: "Xatolik" }) as { ok: boolean; error?: string };
  });

export const equipShopItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ code: z.string().min(1).max(60) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("equip_shop_item", { _code: data.code });
    if (error) throw error;
    return (res ?? { ok: false, error: "Xatolik" }) as { ok: boolean; error?: string };
  });

export const getLeagueBoard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [boardRes, profRes, histRes] = await Promise.all([
      context.supabase.rpc("league_board"),
      context.supabase.from("profiles").select("league, weekly_xp").eq("user_id", context.userId).maybeSingle(),
      context.supabase
        .from("league_history")
        .select("week_start, league, xp, result")
        .order("week_start", { ascending: false })
        .limit(6),
    ]);
    if (boardRes.error) throw boardRes.error;

    const rows = (boardRes.data ?? []) as Record<string, unknown>[];
    return {
      league: normaliseLeague((profRes.data as Record<string, unknown> | null)?.league),
      myXp: Number((profRes.data as Record<string, unknown> | null)?.weekly_xp ?? 0),
      board: rows.map((r, i) => ({
        rank: i + 1,
        name: (r.name as string) ?? "O'quvchi",
        avatar: (r.avatar as string) ?? "🦉",
        xp: Number(r.weekly_xp ?? 0),
        isMe: !!r.is_me,
      })),
      history: ((histRes.data ?? []) as Record<string, unknown>[]).map((r) => ({
        weekStart: r.week_start as string,
        league: normaliseLeague(r.league),
        xp: Number(r.xp ?? 0),
        result: (r.result as string) ?? "stay",
      })),
    };
  });

export const getCoinHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("coin_transactions")
      .select("amount, reason, created_at")
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw error;
    return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      amount: Number(r.amount ?? 0),
      reason: (r.reason as string) ?? "",
      at: r.created_at as string,
    }));
  });
