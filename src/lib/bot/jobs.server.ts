// Scheduled bot jobs: daily words, evening reminders, assignment reminders,
// teacher daily/weekly reports, inactivity alerts, scheduled messages.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { esc, sendMessage } from "@/lib/telegram.server";
import { ai, chatIdOfUser, claimJob, today } from "./core.server";

const HOUR = () => new Date().getUTCHours() + 5; // Tashkent = UTC+5
function tashkentHour() {
  return ((HOUR() % 24) + 24) % 24;
}

export async function runJobs() {
  const hour = tashkentHour();
  const day = today();
  const results: string[] = [];

  results.push(`daily-words: ${await dailyWords(hour, day)}`);
  if (hour === 20) results.push(`reminders: ${await eveningReminders(day)}`);
  if (hour === 9) results.push(`assignments: ${await assignmentReminders(day)}`);
  if (hour === 19) results.push(`teacher-daily: ${await teacherDaily(day)}`);
  if (hour === 18 && new Date().getUTCDay() === 0) results.push(`weekly: ${await teacherWeekly(day)}`);
  if (hour === 10) results.push(`inactive: ${await inactivityAlerts(day)}`);
  if (hour === 19) results.push(`parents-daily: ${await parentReports("daily", day)}`);
  if (hour === 18 && new Date().getUTCDay() === 0)
    results.push(`parents-weekly: ${await parentReports("weekly", day)}`);
  results.push(`scheduled: ${await sendScheduled()}`);

  return results;
}

async function linkedProfiles(filter?: (q: ReturnType<typeof baseQuery>) => unknown) {
  void filter;
  return baseQuery();
}

function baseQuery() {
  return supabaseAdmin
    .from("profiles")
    .select("user_id, name, telegram_id, tg_daily_hour, tg_reminders, streak, last_visit")
    .not("telegram_id", "is", null);
}

async function dailyWords(hour: number, day: string) {
  const { data } = await baseQuery().eq("tg_daily_hour", hour);
  let sent = 0;
  for (const p of data ?? []) {
    if (!(await claimJob(`words:${p.user_id}:${day}`))) continue;
    const { data: words } = await supabaseAdmin
      .from("vocab_words")
      .select("word, translation, example")
      .eq("user_id", p.user_id)
      .eq("assigned_date", day)
      .limit(10);
    if (!words?.length) continue;
    const body = words
      .map((w, i) => `${i + 1}. <b>${esc(w.word)}</b> — ${esc(w.translation)}${w.example ? `\n   <i>${esc(w.example)}</i>` : ""}`)
      .join("\n");
    await sendMessage(p.telegram_id as number, `☀️ <b>Bugungi so'zlar</b>\n\n${body}`, {
      buttons: [[{ text: "🎯 Test qilish", callback_data: "quiz" }, { text: "📖 Hikoya", callback_data: "story" }]],
    });
    sent++;
  }
  return sent;
}

async function eveningReminders(day: string) {
  const { data } = await baseQuery().eq("tg_reminders", true);
  let sent = 0;
  for (const p of data ?? []) {
    const { data: prog } = await supabaseAdmin
      .from("daily_progress")
      .select("id")
      .eq("user_id", p.user_id)
      .eq("day", day)
      .maybeSingle();
    if (prog) continue;
    if (!(await claimJob(`remind:${p.user_id}:${day}`))) continue;
    await sendMessage(
      p.telegram_id as number,
      `🌙 ${esc(p.name ?? "Salom")}! Bugun hali mashq qilmadingiz. 🔥 Streak: ${p.streak ?? 0} kun — uzilib qolmasin!`,
      { buttons: [[{ text: "🎯 5 daqiqalik test", callback_data: "quiz" }]] },
    );
    sent++;
  }
  return sent;
}

async function assignmentReminders(day: string) {
  const tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  const { data: due } = await supabaseAdmin
    .from("assignments")
    .select("id, title, group_id, due_date")
    .in("due_date", [day, tomorrow]);
  let sent = 0;
  for (const a of due ?? []) {
    const { data: members } = await supabaseAdmin
      .from("group_members")
      .select("student_id")
      .eq("group_id", a.group_id);
    for (const m of members ?? []) {
      const { data: done } = await supabaseAdmin
        .from("assignment_completions")
        .select("id")
        .eq("assignment_id", a.id)
        .eq("student_id", m.student_id)
        .maybeSingle();
      if (done) continue;
      if (!(await claimJob(`assign:${a.id}:${m.student_id}:${day}`))) continue;
      const chat = await chatIdOfUser(m.student_id);
      if (!chat) continue;
      await sendMessage(
        chat,
        `📝 <b>Topshiriq eslatmasi</b>\n"${esc(a.title)}" — muddat: ${a.due_date}`,
        { buttons: [[{ text: "📝 Topshiriqlar", callback_data: "assignments" }]] },
      );
      sent++;
    }
  }
  return sent;
}

async function teacherDaily(day: string) {
  const { data: groups } = await supabaseAdmin
    .from("groups")
    .select("id, name, teacher_id")
    .eq("archived", false);
  let sent = 0;
  for (const g of groups ?? []) {
    if (!(await claimJob(`tdaily:${g.id}:${day}`))) continue;
    const chat = await chatIdOfUser(g.teacher_id);
    if (!chat) continue;
    const { data: members } = await supabaseAdmin
      .from("group_members")
      .select("student_id")
      .eq("group_id", g.id);
    const ids = (members ?? []).map((m) => m.student_id);
    if (!ids.length) continue;
    const { data: active } = await supabaseAdmin
      .from("daily_progress")
      .select("user_id")
      .eq("day", day)
      .in("user_id", ids);
    await sendMessage(
      chat,
      `📊 <b>${esc(g.name)} — bugungi holat</b>\n\nO'quvchilar: ${ids.length}\nBugun faol: ${active?.length ?? 0}\nFaol emas: ${ids.length - (active?.length ?? 0)}`,
      { buttons: [[{ text: "👥 Batafsil", callback_data: "students" }]] },
    );
    sent++;
  }
  return sent;
}

async function teacherWeekly(day: string) {
  const { data: groups } = await supabaseAdmin
    .from("groups")
    .select("id, name, teacher_id")
    .eq("archived", false);
  let sent = 0;
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
  for (const g of groups ?? []) {
    if (!(await claimJob(`tweekly:${g.id}:${day}`))) continue;
    const chat = await chatIdOfUser(g.teacher_id);
    if (!chat) continue;
    const { data: members } = await supabaseAdmin
      .from("group_members")
      .select("student_id")
      .eq("group_id", g.id);
    const ids = (members ?? []).map((m) => m.student_id);
    if (!ids.length) continue;
    const { data: mistakes } = await supabaseAdmin
      .from("mistakes")
      .select("tag")
      .in("user_id", ids)
      .gte("created_at", weekAgo);
    const { count: learned } = await supabaseAdmin
      .from("learned_words")
      .select("id", { count: "exact", head: true })
      .in("user_id", ids)
      .gte("created_at", weekAgo);
    const tagCount = new Map<string, number>();
    for (const m of mistakes ?? []) tagCount.set(m.tag ?? "umumiy", (tagCount.get(m.tag ?? "umumiy") ?? 0) + 1);
    const topTags = [...tagCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const advice = await ai(
      g.teacher_id,
      "Siz ingliz tili metodistisiz. O'zbek tilida 2-3 gaplik aniq tavsiya berasiz.",
      `Guruh "${g.name}": shu hafta o'rganilgan so'zlar ${learned ?? 0}, eng ko'p xato mavzular: ${topTags.map(([t, c]) => `${t} (${c})`).join(", ") || "yo'q"}. Ustozga tavsiya bering.`,
    );
    await sendMessage(
      chat,
      `🗓 <b>${esc(g.name)} — haftalik hisobot</b>\n\nO'quvchilar: ${ids.length}\nO'rganilgan so'zlar: ${learned ?? 0}\nXato mavzular: ${topTags.map(([t, c]) => `${t} (${c})`).join(", ") || "—"}\n\n💡 ${advice}`,
    );
    sent++;
  }
  return sent;
}

async function inactivityAlerts(day: string) {
  const limit = new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10);
  const { data: groups } = await supabaseAdmin
    .from("groups")
    .select("id, name, teacher_id")
    .eq("archived", false);
  let sent = 0;
  for (const g of groups ?? []) {
    const chat = await chatIdOfUser(g.teacher_id);
    if (!chat) continue;
    const { data: members } = await supabaseAdmin
      .from("group_members")
      .select("student_id")
      .eq("group_id", g.id);
    const ids = (members ?? []).map((m) => m.student_id);
    if (!ids.length) continue;
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("name, last_visit")
      .in("user_id", ids);
    const idle = (profs ?? []).filter((p) => !p.last_visit || p.last_visit < limit);
    if (!idle.length) continue;
    if (!(await claimJob(`idle:${g.id}:${day}`))) continue;
    await sendMessage(
      chat,
      `⚠️ <b>${esc(g.name)} — nofaol o'quvchilar (3+ kun)</b>\n\n${idle.map((p) => `• ${esc(p.name ?? "Ismsiz")} — oxirgi: ${p.last_visit ?? "hech qachon"}`).join("\n")}`,
    );
    sent++;
  }
  return sent;
}

/** Ota-onalarga notify_freq bo'yicha avtomatik hisobot. */
async function parentReports(freq: "daily" | "weekly", day: string) {
  const { parentByChat, parentItem } = await import("./parent.server");
  const { data: links } = await supabaseAdmin
    .from("parent_links")
    .select("id, telegram_id")
    .eq("active", true)
    .eq("notify_freq", freq)
    .not("telegram_id", "is", null);
  let sent = 0;
  for (const l of links ?? []) {
    const chat = l.telegram_id as number;
    if (!(await claimJob(`parent:${freq}:${l.id}:${day}`))) continue;
    const p = await parentByChat(chat);
    if (!p) continue;
    await sendMessage(
      chat,
      freq === "daily" ? "🔔 <b>Kunlik hisobot</b>" : "🔔 <b>Haftalik hisobot</b>",
    );
    await parentItem(chat, p, freq === "daily" ? "a_today" : "p_week");
    sent++;
  }
  return sent;
}

async function sendScheduled() {
  const { data } = await supabaseAdmin
    .from("scheduled_messages")
    .select("id, teacher_id, group_id, body")
    .is("sent_at", null)
    .lte("send_at", new Date().toISOString())
    .limit(50);
  let sent = 0;
  for (const s of data ?? []) {
    const groupIds: string[] = [];
    if (s.group_id) groupIds.push(s.group_id);
    else {
      const { data: gs } = await supabaseAdmin
        .from("groups")
        .select("id")
        .eq("teacher_id", s.teacher_id)
        .eq("archived", false);
      groupIds.push(...(gs ?? []).map((g) => g.id));
    }
    for (const gid of groupIds) {
      await supabaseAdmin.from("group_messages").insert({ teacher_id: s.teacher_id, group_id: gid, body: s.body });
      const { data: members } = await supabaseAdmin
        .from("group_members")
        .select("student_id")
        .eq("group_id", gid);
      for (const m of members ?? []) {
        await supabaseAdmin.from("notifications").insert({
          recipient_id: m.student_id,
          group_id: gid,
          title: "Ustozdan xabar",
          body: s.body,
        });
        const chat = await chatIdOfUser(m.student_id);
        if (chat) await sendMessage(chat, `📢 <b>Ustozdan xabar</b>\n\n${esc(s.body)}`);
      }
    }
    await supabaseAdmin.from("scheduled_messages").update({ sent_at: new Date().toISOString() }).eq("id", s.id);
    sent++;
  }
  return sent;
}

void linkedProfiles;
