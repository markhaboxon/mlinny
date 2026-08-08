import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { heartbeat, redeemLink } from "@/lib/access.functions";
import { ADMIN_CONTACT } from "@/lib/auth-config";

export const Route = createFileRoute("/enter/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Kirish havolasi — Linny" },
      { name: "description", content: "Bir martalik kirish havolasi orqali tizimga kirish." },
      { property: "og:title", content: "Kirish havolasi — Linny" },
      { property: "og:description", content: "Bir martalik kirish havolasi orqali tizimga kirish." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EnterPage,
});

function EnterPage() {
  const { token } = useParams({ from: "/enter/$token" });
  const redeem = useServerFn(redeemLink);
  const ping = useServerFn(heartbeat);
  const [error, setError] = useState<string | null>(null);
  const once = useRef(false);

  useEffect(() => {
    if (once.current) return;
    once.current = true;
    (async () => {
      try {
        // A different account may already be signed in on this device.
        await supabase.auth.signOut();
        const creds = await redeem({ data: { token } });
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: creds.email,
          password: creds.password,
        });
        if (signInError) throw new Error("Kirishda xatolik. Admin bilan bog'laning.");
        try {
          await ping({ data: { first: true, action: "kirdi" } });
        } catch {
          /* ignore */
        }
        window.location.replace(creds.kind === "admin" ? "/admin" : "/");
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [token, redeem, ping]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="card-surface max-w-md w-full p-8 text-center">
        <div className="w-16 h-16 mx-auto rounded-full gradient-brand flex items-center justify-center text-3xl">
          🦉
        </div>
        {!error ? (
          <>
            <h1 className="mt-4 text-xl font-bold">Tizimga kirilmoqda...</h1>
            <p className="mt-2 text-sm text-muted-foreground">Biroz kuting.</p>
          </>
        ) : (
          <>
            <h1 className="mt-4 text-xl font-bold">Kirib bo'lmadi</h1>
            <p className="mt-2 text-sm text-red-500">{error}</p>
            <div className="mt-4 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
              Xatolik bo'lsa admin bilan bog'laning:
              <br />
              Telegram: <span className="font-medium">@{ADMIN_CONTACT.telegram}</span>
              <br />
              Email: <span className="font-medium">{ADMIN_CONTACT.email}</span>
            </div>
            <a href="/auth" className="btn-primary mt-4 inline-block">
              Login bilan kirish
            </a>
          </>
        )}
      </div>
    </div>
  );
}
