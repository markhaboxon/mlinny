// Yangi qurilmadan kirish bildirishnomasi va vaqtinchalik IP cheklovi.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { esc, sendMessage } from "@/lib/telegram.server";
import { chatIdOfUser } from "./core.server";

export async function isBanned(ip: string | null): Promise<boolean> {
  if (!ip) return false;
  const { data } = await supabaseAdmin.from("login_bans").select("until").eq("ip", ip).maybeSingle();
  return Boolean(data && new Date(data.until as string) > new Date());
}

export async function banIp(ip: string | null, minutes: number, reason: string) {
  if (!ip) return;
  const until = new Date(Date.now() + minutes * 60000).toISOString();
  await supabaseAdmin.from("login_bans").upsert({ ip, until, reason }, { onConflict: "ip" });
}

/**
 * Har bir kirishda chaqiriladi. Qurilma yangi bo'lsa botga "Bu sizmi?"
 * bildirishnomasi yuboriladi. Qurilma rad etilgan bo'lsa `revoked: true` qaytadi.
 */
export async function touchDevice(args: {
  userId: string;
  fingerprint: string;
  label?: string | null;
  ip?: string | null;
}): Promise<{ revoked: boolean }> {
  const { userId, fingerprint } = args;
  const { data: existing } = await supabaseAdmin
    .from("known_devices")
    .select("id, revoked")
    .eq("user_id", userId)
    .eq("fingerprint", fingerprint)
    .maybeSingle();

  if (existing) {
    await supabaseAdmin
      .from("known_devices")
      .update({ last_seen_at: new Date().toISOString(), ip: args.ip ?? null })
      .eq("id", existing.id as string);
    return { revoked: Boolean(existing.revoked) };
  }

  const { data: row } = await supabaseAdmin
    .from("known_devices")
    .insert({
      user_id: userId,
      fingerprint,
      label: args.label ?? null,
      ip: args.ip ?? null,
      approved: false,
    })
    .select("id")
    .single();

  const chat = await chatIdOfUser(userId);
  if (chat && row) {
    await sendMessage(
      chat,
      `🔐 <b>Hisobingizga yangi kirish qayd etildi</b>\n\nQurilma: <i>${esc(args.label ?? "noma'lum")}</i>\nVaqt: ${new Date().toLocaleString("uz-UZ")}\n\nBu sizmi?`,
      {
        buttons: [
          [
            { text: "✅ Ha, bu men", callback_data: `dv:ok:${row.id}` },
            { text: "❌ Yo'q", callback_data: `dv:no:${row.id}` },
          ],
        ],
      },
    );
  }
  return { revoked: false };
}

/** Bot tugmasi: qurilmani tasdiqlash yoki rad etish. */
export async function resolveDevice(deviceId: string, userId: string, approve: boolean) {
  const { data: dev } = await supabaseAdmin
    .from("known_devices")
    .select("id, user_id, ip")
    .eq("id", deviceId)
    .maybeSingle();
  if (!dev || dev.user_id !== userId) return { ok: false };
  await supabaseAdmin
    .from("known_devices")
    .update({ approved: approve, revoked: !approve })
    .eq("id", deviceId);
  if (!approve) {
    await banIp((dev.ip as string | null) ?? null, 180, "Foydalanuvchi kirishni rad etdi");
  }
  return { ok: true };
}
