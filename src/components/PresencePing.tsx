import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { heartbeat } from "@/lib/access.functions";
import { useAuthUser } from "@/hooks/useCloudSync";

/** Keeps "hozir onlayn" + admin activity report up to date. */
export default function PresencePing() {
  const user = useAuthUser();
  const ping = useServerFn(heartbeat);

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
