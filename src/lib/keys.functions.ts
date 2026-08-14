import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const addGeminiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ apiKey: z.string().min(15).max(400), label: z.string().max(60).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { validateGeminiKey, invalidateKeyCache } = await import("./ai-gateway.server");
    const apiKey = data.apiKey.trim();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1) Is this key already in the system (added by anyone)?
    const { data: existing } = await supabaseAdmin
      .from("gemini_keys")
      .select("id, added_by")
      .eq("api_key", apiKey)
      .maybeSingle();

    if (existing) {
      return {
        ok: false as const,
        duplicate: true as const,
        mine: existing.added_by === context.userId,
        error:
          existing.added_by === context.userId
            ? "Bu API kalitni siz avval qo'shgansiz — u allaqachon ishlayapti."
            : "Bu API kalit tizimga avval kiritilgan. Boshqa kalit oling yoki mavjudini ishlating.",
      };
    }

    // 2) Does it actually work?
    const check = await validateGeminiKey(apiKey);
    if (!check.ok) {
      return {
        ok: false as const,
        duplicate: false as const,
        mine: false,
        error:
          check.error ?? "Kalit ishlamadi. Google AI Studio dan to'g'ri API kalit oling.",
      };
    }

    const { error } = await supabaseAdmin
      .from("gemini_keys")
      .insert({ api_key: apiKey, label: data.label ?? null, added_by: context.userId });

    if (error) {
      if (/duplicate key|unique/i.test(error.message)) {
        return {
          ok: false as const,
          duplicate: true as const,
          mine: false,
          error: "Bu API kalit tizimga avval kiritilgan.",
        };
      }
      return { ok: false as const, duplicate: false as const, mine: false, error: error.message };
    }

    // Make the new key usable straight away.
    invalidateKeyCache(apiKey);

    return { ok: true as const, duplicate: false as const, mine: true };
  });

export const getKeyPoolInfo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { keyPoolInfo } = await import("./ai-gateway.server");
    return await keyPoolInfo(context.userId);
  });

/** Admin-only full report of every key connected to the system. */
export const adminKeyReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ live: z.boolean().default(false) }).parse(d))
  .handler(async ({ data, context }) => {
    const { requireKind } = await import("./access.server");
    await requireKind(context.userId, ["admin"]);
    const { keyReport } = await import("./ai-gateway.server");
    const keys = await keyReport(data.live);
    return {
      keys,
      total: keys.length,
      working: keys.filter((k) => k.status === "ok").length,
      limited: keys.filter((k) => k.status === "limit").length,
      broken: keys.filter((k) => k.status === "invalid").length,
      shared: keys.filter((k) => k.scope === "umumiy").length,
      personal: keys.filter((k) => k.scope === "shaxsiy").length,
    };
  });

/** Admin-only: turn a key on/off or delete it. */
export const adminSetKeyActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), active: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireKind } = await import("./access.server");
    await requireKind(context.userId, ["admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("gemini_keys")
      .update({ active: data.active })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    const { invalidateKeyCache } = await import("./ai-gateway.server");
    invalidateKeyCache();
    return { ok: true };
  });

export const adminDeleteKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { requireKind } = await import("./access.server");
    await requireKind(context.userId, ["admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("gemini_keys").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    const { invalidateKeyCache } = await import("./ai-gateway.server");
    invalidateKeyCache();
    return { ok: true };
  });
