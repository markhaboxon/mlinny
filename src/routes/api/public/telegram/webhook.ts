import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { safeEqual, webhookSecret } from "@/lib/telegram.server";
import { handleUpdate, type TgUpdate } from "@/lib/bot/handler.server";

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let expected: string;
        try {
          expected = webhookSecret();
        } catch {
          return new Response("Bot not configured", { status: 503 });
        }
        const got = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (!safeEqual(got, expected)) return new Response("Unauthorized", { status: 401 });

        let update: TgUpdate;
        try {
          update = (await request.json()) as TgUpdate;
        } catch {
          return Response.json({ ok: true, ignored: true });
        }

        if (typeof update.update_id === "number") {
          const { error } = await supabaseAdmin
            .from("telegram_updates")
            .insert({ update_id: update.update_id });
          if (error) return Response.json({ ok: true, duplicate: true });
        }

        try {
          await handleUpdate(update);
        } catch (e) {
          console.error("telegram handler error", e);
        }
        return Response.json({ ok: true });
      },
    },
  },
});
