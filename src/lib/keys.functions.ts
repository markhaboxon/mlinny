import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Foydalanuvchi API kalit ulaydi.
 * - Admin qo'shsa — kalit umumiy bo'ladi (`scope: "global"`), hammaga ishlaydi.
 * - Boshqa rollar qo'shsa — kalit faqat o'sha foydalanuvchi uchun (`scope: "user"`).
 * - Kalit bazada allaqachon bo'lsa, ochiq aytiladi ("avval kiritilgan").
 */
export const addGeminiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ apiKey: z.string().min(15).max(400), label: z.string().max(60).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { validateGeminiKey, invalidateKeyCache } = await import("./ai-gateway.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { accountOfUser } = await import("./access.server");
    const apiKey = data.apiKey.trim();

    // 1) Umumiy bazada shu kalit bormi?
    const { data: existing } = await supabaseAdmin
      .from("gemini_keys")
      .select("id, owner_id, added_by, scope")
      .eq("api_key", apiKey)
      .maybeSingle();

    if (existing) {
      const owner = (existing.owner_id as string | null) ?? (existing.added_by as string | null);
      return {
        ok: false as const,
        already: true as const,
        error:
          owner === context.userId
            ? "Bu API kalit siz tomonidan allaqachon kiritilgan — qayta kiritish kerak emas."
            : "Bu API kalit tizimga avval kiritilgan (boshqa foydalanuvchi tomonidan). Iltimos, boshqa kalit oling.",
      };
    }

    // 2) Kalit haqiqatan ishlayaptimi?
    const check = await validateGeminiKey(apiKey);
    if (!check.ok) {
      return {
        ok: false as const,
        already: false as const,
        error:
          check.error ??
          "Kalit ishlamadi. Google AI Studio dan to'g'ri API kalit oling va to'liq nusxalab kiriting.",
      };
    }

    const acc = await accountOfUser(context.userId).catch(() => null);
    const kind = acc?.kind ?? "user";
    const scope = kind === "admin" ? "global" : "user";

    const { error } = await supabaseAdmin.from("gemini_keys").insert({
      api_key: apiKey,
      label: data.label ?? null,
      added_by: context.userId,
      owner_id: context.userId,
      scope,
    });

    if (error) {
      if (/duplicate key|unique/i.test(error.message)) {
        return { ok: false as const, already: true as const, error: "Bu API kalit avval kiritilgan." };
      }
      return { ok: false as const, already: false as const, error: error.message };
    }

    // Yangi kalit darhol ishlashi uchun kesh va kutish rejimlari tozalanadi.
    invalidateKeyCache(apiKey);

    return {
      ok: true as const,
      already: false as const,
      scope,
      message:
        scope === "global"
          ? "✅ Kalit qabul qilindi va umumiy tizimga qo'shildi."
          : "✅ Kalit qabul qilindi. Bu kalit faqat sizning mashqlaringiz uchun ishlatiladi.",
    };
  });

export const getKeyPoolInfo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { keyPoolInfo } = await import("./ai-gateway.server");
    return await keyPoolInfo(context.userId);
  });

/** Foydalanuvchining o'z kalitlari (qiymat ko'rsatilmaydi). */
export const myKeys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { maskKey } = await import("./ai-gateway.server");
    const { data } = await supabaseAdmin
      .from("gemini_keys")
      .select("id, api_key, active, created_at, calls_today, calls_total, last_ok_at, last_error")
      .eq("owner_id", context.userId)
      .eq("scope", "user")
      .order("created_at", { ascending: true });
    return (data ?? []).map((r) => ({
      id: r.id as string,
      masked: maskKey(r.api_key as string),
      active: !!r.active,
      callsToday: (r.calls_today as number) ?? 0,
      callsTotal: (r.calls_total as number) ?? 0,
      lastOkAt: (r.last_ok_at as string | null) ?? null,
      lastError: (r.last_error as string | null) ?? null,
      createdAt: r.created_at as string,
    }));
  });

/** Admin: barcha kalitlar bo'yicha to'liq hisobot. */
export const adminKeysReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireKind } = await import("./access.server");
    await requireKind(context.userId, ["admin"]);
    const { keysReport } = await import("./ai-gateway.server");
    return await keysReport();
  });

/** Admin: kalitni o'chirish yoki yoqish/o'chirish. */
export const adminToggleKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), active: z.boolean().optional(), remove: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireKind } = await import("./access.server");
    await requireKind(context.userId, ["admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { invalidateKeyCache } = await import("./ai-gateway.server");
    if (data.remove) {
      const { error } = await supabaseAdmin.from("gemini_keys").delete().eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("gemini_keys")
        .update({ active: data.active ?? true })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
    }
    invalidateKeyCache();
    return { ok: true as const };
  });
