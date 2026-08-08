import { createFileRoute } from "@tanstack/react-router";
import { runJobs } from "@/lib/bot/jobs.server";

/**
 * Called every hour by an external scheduler:
 *   GET /api/public/telegram/cron?key=<CRON_SECRET>
 */
export const Route = createFileRoute("/api/public/telegram/cron")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = process.env["CRON_SECRET"];
        const url = new URL(request.url);
        const key = url.searchParams.get("key") ?? request.headers.get("x-cron-key") ?? "";
        if (!secret || key !== secret) return new Response("Unauthorized", { status: 401 });
        try {
          const results = await runJobs();
          return Response.json({ ok: true, results });
        } catch (e) {
          console.error("cron error", e);
          return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
