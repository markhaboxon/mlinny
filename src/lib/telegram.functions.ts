import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/** Current Telegram link state for the signed-in user. */
export const telegramStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("telegram_id, telegram_username, telegram_linked_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    return {
      linked: !!data?.telegram_id,
      username: data?.telegram_username ?? null,
      linkedAt: data?.telegram_linked_at ?? null,
      botUsername: process.env["TELEGRAM_BOT_USERNAME"] ?? null,
    };
  });

/** Creates a fresh one-time deep link to connect this account with the bot. */
export const createTelegramLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { genToken } = await import("./access.server");

    await supabaseAdmin.from("telegram_links").delete().eq("user_id", context.userId).is("used_at", null);
    const token = genToken();
    const { error } = await supabaseAdmin
      .from("telegram_links")
      .insert({ user_id: context.userId, token });
    if (error) throw new Error(error.message);

    let botUsername = process.env["TELEGRAM_BOT_USERNAME"] ?? null;
    if (!botUsername) {
      try {
        const t = process.env["TELEGRAM_BOT_TOKEN"];
        if (t) {
          const res = await fetch(`https://api.telegram.org/bot${t}/getMe`);
          const j = (await res.json()) as { ok: boolean; result?: { username?: string } };
          botUsername = j.result?.username ?? null;
        }
      } catch {
        /* ignore */
      }
    }
    if (!botUsername) throw new Error("Bot sozlanmagan. Admin bilan bog'laning.");
    return { url: `https://t.me/${botUsername}?start=${token}`, token };
  });

export const unlinkTelegram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("profiles")
      .update({ telegram_id: null, telegram_username: null, telegram_linked_at: null })
      .eq("user_id", context.userId);
    return { ok: true };
  });

/** Admin-only: (re)register the webhook with Telegram and report its state. */
export const setupTelegramWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ origin: z.string().url() }).parse(d))
  .handler(async ({ data, context }) => {
    const { requireKind } = await import("./access.server");
    await requireKind(context.userId, ["admin"]);
    const { setWebhook, getWebhookInfo, setCommands } = await import("./telegram.server");
    const { GUEST_COMMANDS } = await import("./bot/commands.server");

    const url = `${data.origin.replace(/\/$/, "")}/api/public/telegram/webhook`;
    const ok = await setWebhook(url);
    // Default menu = guest only. Each linked chat gets its own role-based list.
    await setCommands(GUEST_COMMANDS);
    const info = await getWebhookInfo();
    return { ok: !!ok, url, pendingUrl: String((info?.["url"] as string) ?? "") };
  });
