import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { heartbeat } from "@/lib/access.functions";
import { registerDevice } from "@/lib/tg-auth.functions";
import { useAuthUser } from "@/hooks/useCloudSync";
import { deviceFingerprint, deviceLabel } from "@/lib/device";
import { supabase } from "@/integrations/supabase/client";

/** Keeps "hozir onlayn" + admin activity report up to date. */
export default function PresencePing() {
  const user = useAuthUser();
  const ping = useServerFn(heartbeat);
  const device = useServerFn(registerDevice);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    const send = () => {
      const action = window.location.pathname.startsWith("/teacher")
        ? "ustoz panelida"
        : window.location.pathname.startsWith("/admin")
          ? "admin panelida"
          : "saytda";
      ping({ data: { action } }).catch(() => {});
      // Telegramda rad etilgan qurilma bo'lsa sessiya darhol yopiladi.
      device({ data: { fingerprint: deviceFingerprint(), label: deviceLabel() } })
        .then(async (r) => {
          if (alive && r?.revoked) {
            await supabase.auth.signOut();
            window.location.replace("/auth");
          }
        })
        .catch(() => {});
      return alive;
    };
    send();
    const id = setInterval(send, 60000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

