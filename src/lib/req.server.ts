// So'rov haqidagi server-only yordamchilar.
import { getRequest } from "@tanstack/react-start/server";

/** Foydalanuvchi IP manzili (proxy sarlavhalari orqali). */
export function clientIp(): string | null {
  try {
    const h = getRequest().headers;
    return h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  } catch {
    return null;
  }
}
