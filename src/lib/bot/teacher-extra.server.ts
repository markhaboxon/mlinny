// Ustoz uchun qo'shimcha bot funksiyalari: guruhlar, o'quvchi kartochkasi,
// reyting, davomat, topshiriq berish, materiallar, dars rejasi.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { esc, sendMessage, type Button } from "@/lib/telegram.server";
import { chatIdOfUser, clearState, setState, today, type BotUser } from "./core.server";

async function myGroups(userId: string) {
  const { data } = await supabaseAdmin
    .from("groups")
    .select("id, name, join_code, lesson_days, lesson_time, capacity")
    .eq("teacher_id", userId)
    .eq("archived", false)
    .order("created_at");
  return data ?? [];
}

async function memberIds(groupIds: string[]) {
  if (!groupIds.length) return [];
  const { data } = await supabaseAdmin
    .from("group_members")
    .select("student_id, group_id")
    .in("group_id", groupIds);
  return data ?? [];
}

export async function teacherGroupsList(u: BotUser) {
  const groups = await myGroups(u.userId);
  if (!groups.length) return void sendMessage(u.chatId, "📭 Sizda faol guruh yo'q.");
  const members = await memberIds(groups.map((g) => g.id as string));
  const rows = groups.map((g) => {
    const n = members.filter((m) => m.group_id === g.id).length;
    return `<b>${esc(String(g.name))}</b>\n  👥 ${n}${g.capacity ? `/${g.capacity}` : ""} o'quvchi\n  🗓 ${esc(String(g.lesson_days ?? "—"))} ${esc(String(g.lesson_time ?? ""))}\n  🔑 kod: <code>${g.join_code}</code>`;
  });
  return void sendMessage(u.chatId, `🏫 <b>Guruhlarim</b>\n\n${rows.join("\n\n")}`);
}

export async function teacherStudentCard(u: BotUser, query: string) {
  if (!query) {
    await setState(u.chatId, { mode: "student_search" });
    return void sendMessage(u.chatId, "🔍 O'quvchining ismini yozing:");
  }
  const groups = await myGroups(u.userId);
  const members = await memberIds(groups.map((g) => g.id as string));
  const ids = members.map((m) => m.student_id as string);
  if (!ids.length) return void sendMessage(u.chatId, "📭 O'quvchi yo'q.");
  const { data: profs } = await supabaseAdmin
    .from("profiles")
    .select("user_id, name, level_chosen, streak, best_streak, last_visit, total_xp")
    .in("user_id", ids);
  const q = query.toLowerCase();
  const hits = (profs ?? []).filter((p) => String(p.name ?? "").toLowerCase().includes(q));
  if (!hits.length) return void sendMessage(u.chatId, "🔍 Bunday o'quvchi topilmadi.");
  for (const p of hits.slice(0, 3)) {
    const sinceWeek = new Date(Date.now() - 7 * 864e5).toISOString();
    const [{ count: words }, { count: mistakes }] = await Promise.all([
      supabaseAdmin
        .from("learned_words")
        .select("id", { count: "exact", head: true })
        .eq("user_id", p.user_id as string)
        .gte("created_at", sinceWeek),
      supabaseAdmin
        .from("mistakes")
        .select("id", { count: "exact", head: true })
        .eq("user_id", p.user_id as string)
        .gte("created_at", sinceWeek),
    ]);
    const g = members.find((m) => m.student_id === p.user_id);
    const gName = groups.find((x) => x.id === g?.group_id)?.name ?? "—";
    await sendMessage(
      u.chatId,
      `👤 <b>${esc(String(p.name ?? "Ismsiz"))}</b>\nGuruh: ${esc(String(gName))}\nDaraja: ${p.level_chosen ?? "—"}\n🔥 Streak: ${p.streak ?? 0} (rekord ${p.best_streak ?? 0})\n⚡ XP: ${p.total_xp ?? 0}\n📚 Hafta: ${words ?? 0} so'z, ❌ ${mistakes ?? 0} xato\n🕐 Oxirgi: ${p.last_visit ?? "—"}`,
    );
  }
}

export async function teacherTop(u: BotUser) {
  const groups = await myGroups(u.userId);
  const members = await memberIds(groups.map((g) => g.id as string));
  const ids = members.map((m) => m.student_id as string);
  if (!ids.length) return void sendMessage(u.chatId, "📭 O'quvchi yo'q.");
  const { data: profs } = await supabaseAdmin
    .from("profiles")
    .select("user_id, name, weekly_xp, total_xp, streak")
    .in("user_id", ids);
  const sorted = (profs ?? []).sort(
    (a, b) => ((b.weekly_xp as number) ?? 0) - ((a.weekly_xp as number) ?? 0),
  );
  return void sendMessage(
    u.chatId,
    `🏆 <b>Eng faol o'quvchilar (hafta)</b>\n\n${sorted
      .slice(0, 10)
      .map(
        (p, i) =>
          `${["🥇", "🥈", "🥉"][i] ?? `${i + 1}.`} ${esc(String(p.name ?? "Ismsiz"))} — ${p.weekly_xp ?? 0} XP, 🔥${p.streak ?? 0}`,
      )
      .join("\n")}`,
  );
}

export async function teacherAbsent(u: BotUser) {
  const groups = await myGroups(u.userId);
  const members = await memberIds(groups.map((g) => g.id as string));
  const ids = members.map((m) => m.student_id as string);
  if (!ids.length) return void sendMessage(u.chatId, "📭 O'quvchi yo'q.");
  const { data: prog } = await supabaseAdmin
    .from("daily_progress")
    .select("user_id")
    .eq("day", today())
    .in("user_id", ids);
  const active = new Set((prog ?? []).map((p) => p.user_id as string));
  const { data: profs } = await supabaseAdmin
    .from("profiles")
    .select("user_id, name, last_visit")
    .in("user_id", ids);
  const absent = (profs ?? []).filter((p) => !active.has(p.user_id as string));
  if (!absent.length) return void sendMessage(u.chatId, "🎉 Bugun hamma mashq qilgan!");
  const buttons: Button[][] = absent
    .slice(0, 5)
    .map((p) => [{ text: `🔔 ${String(p.name ?? "Ismsiz").slice(0, 24)}`, callback_data: `poke:${p.user_id}` }]);
  return void sendMessage(
    u.chatId,
    `⛔️ <b>Bugun mashq qilmaganlar (${absent.length})</b>\n\n${absent
      .map((p) => `• ${esc(String(p.name ?? "Ismsiz"))} — oxirgi: ${p.last_visit ?? "—"}`)
      .join("\n")}`,
    { buttons },
  );
}

export async function pokeStudent(u: BotUser, studentId: string) {
  const chat = await chatIdOfUser(studentId);
  await supabaseAdmin.from("notifications").insert({
    recipient_id: studentId,
    title: "Ustozdan eslatma",
    body: "Bugun mashq qilishni unutmang! 💪",
  });
  if (chat) await sendMessage(chat, "🔔 <b>Ustozdan eslatma</b>\n\nBugun mashq qilishni unutmang! 💪");
  return void sendMessage(u.chatId, chat ? "✅ Eslatma yuborildi." : "ℹ️ Saqlandi (o'quvchi botga ulanmagan).");
}

export async function teacherAssignStart(u: BotUser) {
  const groups = await myGroups(u.userId);
  if (!groups.length) return void sendMessage(u.chatId, "📭 Avval saytda guruh yarating.");
  await setState(u.chatId, { mode: "assign" });
  return void sendMessage(
    u.chatId,
    `📝 <b>Yangi topshiriq</b>\n\nQuyidagi formatda yozing:\n<code>Guruh nomi | Sarlavha | Izoh | YYYY-MM-DD</code>\n\nGuruhlar: ${groups
      .map((g) => esc(String(g.name)))
      .join(", ")}`,
  );
}

export async function teacherAssignSave(u: BotUser, text: string) {
  const parts = text.split("|").map((p) => p.trim());
  if (parts.length < 2) {
    return void sendMessage(u.chatId, "❌ Format noto'g'ri. <code>Guruh | Sarlavha | Izoh | 2026-01-20</code>");
  }
  await clearState(u.chatId, ["mode"]);
  const groups = await myGroups(u.userId);
  const g = groups.find((x) => String(x.name).toLowerCase() === parts[0]!.toLowerCase());
  if (!g) return void sendMessage(u.chatId, "❌ Bunday guruh topilmadi.");
  const { error } = await supabaseAdmin.from("assignments").insert({
    group_id: g.id as string,
    teacher_id: u.userId,
    title: parts[1]!,
    note: parts[2] || null,
    due_date: parts[3] || null,
  });
  if (error) return void sendMessage(u.chatId, `❌ Xatolik: ${esc(error.message)}`);

  const members = await memberIds([g.id as string]);
  let sent = 0;
  for (const m of members) {
    await supabaseAdmin.from("notifications").insert({
      recipient_id: m.student_id as string,
      group_id: g.id as string,
      title: "Yangi topshiriq",
      body: parts[1]!,
    });
    const chat = await chatIdOfUser(m.student_id as string);
    if (chat) {
      await sendMessage(
        chat,
        `📝 <b>Yangi topshiriq</b>\n\n<b>${esc(parts[1]!)}</b>${parts[2] ? `\n${esc(parts[2])}` : ""}${parts[3] ? `\nMuddat: ${esc(parts[3])}` : ""}`,
      );
      sent++;
    }
  }
  return void sendMessage(u.chatId, `✅ Topshiriq yaratildi. ${sent} ta o'quvchiga Telegramga yuborildi.`);
}

export async function teacherMaterials(u: BotUser) {
  const { data } = await supabaseAdmin
    .from("teacher_materials")
    .select("title, kind, created_at")
    .eq("teacher_id", u.userId)
    .order("created_at", { ascending: false })
    .limit(15);
  if (!data?.length) return void sendMessage(u.chatId, "📭 Materiallar yo'q. Saytda qo'shishingiz mumkin.");
  return void sendMessage(
    u.chatId,
    `📚 <b>Materiallar</b>\n\n${data
      .map((m) => `• ${esc(String(m.title))} (${esc(String(m.kind))})`)
      .join("\n")}`,
  );
}

export async function teacherCurriculum(u: BotUser) {
  const groups = await myGroups(u.userId);
  if (!groups.length) return void sendMessage(u.chatId, "📭 Guruh yo'q.");
  const { data } = await supabaseAdmin
    .from("curriculum_entries")
    .select("group_id, topic, planned_date, taught_at")
    .in(
      "group_id",
      groups.map((g) => g.id as string),
    )
    .order("position")
    .limit(30);
  if (!data?.length) return void sendMessage(u.chatId, "📭 Dars rejasi bo'sh.");
  const byGroup = new Map<string, string[]>();
  for (const c of data) {
    const name = String(groups.find((g) => g.id === c.group_id)?.name ?? "—");
    const line = `${c.taught_at ? "✅" : "🔸"} ${esc(String(c.topic))}${c.planned_date ? ` — ${c.planned_date}` : ""}`;
    byGroup.set(name, [...(byGroup.get(name) ?? []), line]);
  }
  return void sendMessage(
    u.chatId,
    `🗂 <b>Dars rejasi</b>\n\n${[...byGroup.entries()]
      .map(([n, rows]) => `<b>${esc(n)}</b>\n${rows.join("\n")}`)
      .join("\n\n")}`,
  );
}
