// Ota-ona paneli: kategoriya tugmalari (pastki klaviatura) + har birida
// bir nechta funksiya. Jami 28 ta hisobot/amal.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { esc, sendMessage, setChatCommands, type Button } from "@/lib/telegram.server";
import { ai, chatIdOfUser, clearState, getState, setState, today } from "./core.server";

export type ParentCtx = {
  linkId: string;
  accountId: string;
  studentId: string;
  studentName: string;
  notifyFreq: string;
};

export async function parentByChat(chatId: number): Promise<ParentCtx | null> {
  const { data: link } = await supabaseAdmin
    .from("parent_links")
    .select("id, account_id, notify_freq")
    .eq("telegram_id", chatId)
    .eq("active", true)
    .maybeSingle();
  if (!link) return null;
  const { data: acc } = await supabaseAdmin
    .from("app_accounts")
    .select("id, user_id, full_name, login")
    .eq("id", link.account_id as string)
    .maybeSingle();
  if (!acc?.user_id) return null;
  return {
    linkId: link.id as string,
    accountId: acc.id as string,
    studentId: acc.user_id as string,
    studentName: (acc.full_name as string | null) ?? (acc.login as string),
    notifyFreq: (link.notify_freq as string) ?? "weekly",
  };
}

const CATS = {
  "📊 Progress": [
    ["p_overview", "📈 Umumiy progress"],
    ["p_week", "🗓 Haftalik hisobot"],
    ["p_month", "📆 Oylik hisobot"],
    ["p_level", "🏷 Daraja (CEFR)"],
    ["p_words", "📚 So'z boyligi"],
  ],
  "📅 Faollik": [
    ["a_today", "☀️ Bugungi natija"],
    ["a_days", "✅ Faol kunlar"],
    ["a_streak", "🔥 Streak"],
    ["a_last", "🕐 Oxirgi faollik"],
    ["a_chart", "📊 7 kunlik jadval"],
  ],
  "🎯 Ta'lim sifati": [
    ["q_acc", "🎯 Aniqlik darajasi"],
    ["q_mistakes", "❌ Xatolar ro'yxati"],
    ["q_weak", "🧠 Zaif mavzular (AI)"],
    ["q_trend", "📈 Yaxshilanish trendi"],
  ],
  "🏆 Yutuqlar": [
    ["r_xp", "⚡ XP va liga"],
    ["r_coins", "🪙 Tangalar"],
    ["r_best", "🥇 Rekordlar"],
    ["r_rank", "👥 Guruhdagi o'rni"],
  ],
  "📝 Topshiriqlar": [
    ["t_list", "📝 Topshiriqlar holati"],
    ["t_done", "✅ Bajarilganlar"],
    ["t_late", "⏰ Muddati o'tganlar"],
    ["t_quiz", "🎯 Test natijalari"],
  ],
  "💬 Aloqa": [
    ["c_write", "✍️ Ustozga xabar"],
    ["c_teacher", "👨‍🏫 Ustoz ma'lumoti"],
    ["c_msgs", "📢 Guruh xabarlari"],
  ],
  "⚙️ Sozlamalar": [
    ["s_freq", "🔔 Hisobot chastotasi"],
    ["s_child", "👦 Farzand ma'lumoti"],
    ["s_off", "🔌 Kuzatuvni uzish"],
  ],
} as const;

export function parentKeyboard(): string[][] {
  const keys = Object.keys(CATS);
  return [
    [keys[0]!, keys[1]!],
    [keys[2]!, keys[3]!],
    [keys[4]!, keys[5]!],
    [keys[6]!],
  ];
}

export async function syncParentCommands(chatId: number) {
  await setChatCommands(chatId, [{ command: "menu", description: "Ota-ona paneli" }]);
}

export async function parentMenu(chatId: number, p: ParentCtx) {
  await syncParentCommands(chatId);
  return void sendMessage(
    chatId,
    `👨‍👩‍👦 <b>Ota-ona paneli</b>\n\nFarzand: <b>${esc(p.studentName)}</b>\n\nPastdagi tugmalardan bo'limni tanlang.`,
    { replyKeyboard: parentKeyboard() },
  );
}

function catButtons(cat: keyof typeof CATS): Button[][] {
  return CATS[cat].map((i) => [{ text: i[1], callback_data: `pi:${i[0]}` }]);
}

/** Pastki tugma bosilganda (matn) — kategoriya ichini ko'rsatadi. */
export async function parentText(chatId: number, p: ParentCtx, text: string): Promise<boolean> {
  const st = await getState(chatId);
  if (st["mode"] === "parent_msg") {
    await clearState(chatId, ["mode"]);
    await sendTeacherMessage(chatId, p, text);
    return true;
  }
  if (text === "/menu" || text === "/start") {
    await parentMenu(chatId, p);
    return true;
  }
  if (text in CATS) {
    const cat = text as keyof typeof CATS;
    await sendMessage(chatId, `<b>${esc(cat)}</b>\nKerakli hisobotni tanlang:`, {
      buttons: catButtons(cat),
    });
    return true;
  }
  return false;
}

// --- ma'lumot yig'ish -------------------------------------------------------
async function counts(studentId: string, sinceIso: string) {
  const [{ count: learned }, { count: mistakes }] = await Promise.all([
    supabaseAdmin
      .from("learned_words")
      .select("id", { count: "exact", head: true })
      .eq("user_id", studentId)
      .gte("created_at", sinceIso),
    supabaseAdmin
      .from("mistakes")
      .select("id", { count: "exact", head: true })
      .eq("user_id", studentId)
      .gte("created_at", sinceIso),
  ]);
  const total = (learned ?? 0) + (mistakes ?? 0);
  return {
    learned: learned ?? 0,
    mistakes: mistakes ?? 0,
    acc: total === 0 ? 0 : Math.round((100 * (learned ?? 0)) / total),
  };
}

async function prof(studentId: string) {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select(
      "name, age, gender, level_chosen, streak, best_streak, last_visit, total_xp, weekly_xp, league, coins, difficulty",
    )
    .eq("user_id", studentId)
    .maybeSingle();
  return data;
}

async function daysSince(studentId: string, since: string) {
  const { data } = await supabaseAdmin
    .from("daily_progress")
    .select("day")
    .eq("user_id", studentId)
    .gte("day", since);
  return (data ?? []).map((d) => d.day as string);
}

async function groupOf(studentId: string) {
  const { data: m } = await supabaseAdmin
    .from("group_members")
    .select("group_id")
    .eq("student_id", studentId)
    .maybeSingle();
  if (!m) return null;
  const { data: g } = await supabaseAdmin
    .from("groups")
    .select("id, name, teacher_id, lesson_days, lesson_time")
    .eq("id", m.group_id as string)
    .maybeSingle();
  return g ?? null;
}

async function sendTeacherMessage(chatId: number, p: ParentCtx, body: string) {
  const g = await groupOf(p.studentId);
  if (!g) return void sendMessage(chatId, "❌ Farzandingiz hech qaysi guruhda emas.");
  await supabaseAdmin.from("notifications").insert({
    recipient_id: g.teacher_id as string,
    group_id: g.id as string,
    title: `Ota-onadan xabar (${p.studentName})`,
    body,
  });
  const chat = await chatIdOfUser(g.teacher_id as string);
  if (chat)
    await sendMessage(
      chat,
      `💬 <b>Ota-onadan xabar</b>\nO'quvchi: <b>${esc(p.studentName)}</b>\n\n${esc(body)}`,
    );
  return void sendMessage(chatId, "✅ Xabaringiz ustozga yuborildi.", {
    replyKeyboard: parentKeyboard(),
  });
}

const D = 864e5;
const iso = (days: number) => new Date(Date.now() - days * D).toISOString();

/** Inline tugma (pi:<key>) bosilganda. */
export async function parentItem(chatId: number, p: ParentCtx, key: string): Promise<void> {
  const name = esc(p.studentName);
  const send = (t: string, buttons?: Button[][]) =>
    void sendMessage(chatId, t, buttons ? { buttons } : {});

  switch (key) {
    case "p_overview": {
      const all = await counts(p.studentId, "1970-01-01T00:00:00Z");
      const pr = await prof(p.studentId);
      const days = await daysSince(p.studentId, "1970-01-01");
      return send(
        `📈 <b>${name} — umumiy progress</b>\n\n📚 O'rganilgan so'zlar: ${all.learned}\n❌ Xatolar: ${all.mistakes}\n🎯 Aniqlik: ${all.acc}%\n📅 Jami faol kunlar: ${days.length}\n🏷 Daraja: ${pr?.level_chosen ?? "—"}\n⚡ Jami XP: ${pr?.total_xp ?? 0}`,
      );
    }
    case "p_week": {
      const c = await counts(p.studentId, iso(7));
      const days = await daysSince(p.studentId, new Date(Date.now() - 7 * D).toISOString().slice(0, 10));
      return send(
        `🗓 <b>${name} — haftalik hisobot</b>\n\n📚 Yangi so'zlar: ${c.learned}\n❌ Xatolar: ${c.mistakes}\n🎯 Aniqlik: ${c.acc}%\n📅 Faol kunlar: ${days.length}/7`,
      );
    }
    case "p_month": {
      const c = await counts(p.studentId, iso(30));
      const days = await daysSince(p.studentId, new Date(Date.now() - 30 * D).toISOString().slice(0, 10));
      return send(
        `📆 <b>${name} — oylik hisobot</b>\n\n📚 Yangi so'zlar: ${c.learned}\n❌ Xatolar: ${c.mistakes}\n🎯 Aniqlik: ${c.acc}%\n📅 Faol kunlar: ${days.length}/30`,
      );
    }
    case "p_level": {
      const pr = await prof(p.studentId);
      return send(
        `🏷 <b>${name} — daraja</b>\n\nHozirgi daraja: <b>${pr?.level_chosen ?? "—"}</b>\nQiyinlik: ${pr?.difficulty ?? "—"}\n\nDaraja o'quvchining test natijalari asosida belgilanadi.`,
      );
    }
    case "p_words": {
      const { data } = await supabaseAdmin
        .from("learned_words")
        .select("word, translation, created_at")
        .eq("user_id", p.studentId)
        .order("created_at", { ascending: false })
        .limit(15);
      if (!data?.length) return send("📭 Hozircha o'rganilgan so'z yo'q.");
      return send(
        `📚 <b>${name} — oxirgi so'zlar</b>\n\n${data
          .map((w, i) => `${i + 1}. <b>${esc(w.word as string)}</b> — ${esc(w.translation as string)}`)
          .join("\n")}`,
      );
    }
    case "a_today": {
      const c = await counts(p.studentId, `${today()}T00:00:00Z`);
      const days = await daysSince(p.studentId, today());
      return send(
        `☀️ <b>${name} — bugun</b>\n\n${days.length ? "✅ Bugun mashq qildi" : "⛔️ Bugun hali mashq qilmadi"}\n📚 Yangi so'zlar: ${c.learned}\n❌ Xatolar: ${c.mistakes}\n🎯 Aniqlik: ${c.acc}%`,
      );
    }
    case "a_days": {
      const d7 = await daysSince(p.studentId, new Date(Date.now() - 7 * D).toISOString().slice(0, 10));
      const d30 = await daysSince(p.studentId, new Date(Date.now() - 30 * D).toISOString().slice(0, 10));
      return send(
        `✅ <b>${name} — faol kunlar</b>\n\nOxirgi 7 kun: ${d7.length}\nOxirgi 30 kun: ${d30.length}`,
      );
    }
    case "a_streak": {
      const pr = await prof(p.studentId);
      return send(
        `🔥 <b>${name} — streak</b>\n\nHozirgi: ${pr?.streak ?? 0} kun\nRekord: ${pr?.best_streak ?? 0} kun`,
      );
    }
    case "a_last": {
      const pr = await prof(p.studentId);
      const { data: act } = await supabaseAdmin
        .from("activity_log")
        .select("action, created_at")
        .eq("user_id", p.studentId)
        .order("created_at", { ascending: false })
        .limit(5);
      const rows = (act ?? [])
        .map((a) => `• ${new Date(a.created_at as string).toLocaleString("uz-UZ")} — ${esc(a.action as string)}`)
        .join("\n");
      return send(
        `🕐 <b>${name} — oxirgi faollik</b>\n\nOxirgi tashrif: ${pr?.last_visit ?? "—"}\n\n${rows || "Ma'lumot yo'q."}`,
      );
    }
    case "a_chart": {
      const days = new Set(
        await daysSince(p.studentId, new Date(Date.now() - 6 * D).toISOString().slice(0, 10)),
      );
      const rows: string[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * D).toISOString().slice(0, 10);
        rows.push(`${d} ${days.has(d) ? "🟩 mashq qildi" : "⬜️ yo'q"}`);
      }
      return send(`📊 <b>${name} — 7 kunlik jadval</b>\n\n${rows.join("\n")}`);
    }
    case "q_acc": {
      const w = await counts(p.studentId, iso(7));
      const m = await counts(p.studentId, iso(30));
      return send(
        `🎯 <b>${name} — aniqlik</b>\n\nHafta: ${w.acc}% (${w.learned}/${w.learned + w.mistakes})\nOy: ${m.acc}% (${m.learned}/${m.learned + m.mistakes})`,
      );
    }
    case "q_mistakes": {
      const { data } = await supabaseAdmin
        .from("mistakes")
        .select("question, correct_answer, wrong_answer, tag, created_at")
        .eq("user_id", p.studentId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (!data?.length) return send("🎉 Xatolar yo'q — zo'r!");
      return send(
        `❌ <b>${name} — oxirgi xatolar</b>\n\n${data
          .map(
            (m) =>
              `• ${esc(String(m.question).slice(0, 60))}\n  to'g'ri: <b>${esc(String(m.correct_answer))}</b>${m.wrong_answer ? `, javobi: ${esc(String(m.wrong_answer))}` : ""}`,
          )
          .join("\n")}`,
      );
    }
    case "q_weak": {
      const { data } = await supabaseAdmin
        .from("mistakes")
        .select("question, correct_answer, tag")
        .eq("user_id", p.studentId)
        .order("created_at", { ascending: false })
        .limit(40);
      if (!data?.length) return send("🎉 Tahlil uchun xato yo'q — farzandingiz yaxshi ketmoqda.");
      const text = await ai(
        undefined,
        "Siz ingliz tili ustozisiz. Ota-onaga o'zbek tilida sodda, qisqa tushuntirasiz.",
        `O'quvchining xatolari:\n${data
          .map((m) => `- ${m.tag ?? "umumiy"}: ${m.question} → ${m.correct_answer}`)
          .join("\n")}\n\n3 ta zaif mavzuni ayting va ota-ona uyda qanday yordam berishi mumkinligini 1-2 gapda tushuntiring.`,
        { cacheKey: `pweak:${p.studentId}:${today()}` },
      );
      return send(`🧠 <b>${name} — zaif mavzular</b>\n\n${text}`);
    }
    case "q_trend": {
      const thisWeek = await counts(p.studentId, iso(7));
      const prev = await counts(p.studentId, iso(14));
      const prevOnly = {
        learned: prev.learned - thisWeek.learned,
        mistakes: prev.mistakes - thisWeek.mistakes,
      };
      const arrow = thisWeek.learned >= prevOnly.learned ? "📈 o'sish" : "📉 pasayish";
      return send(
        `📈 <b>${name} — trend</b>\n\nBu hafta: ${thisWeek.learned} so'z, ${thisWeek.mistakes} xato\nO'tgan hafta: ${prevOnly.learned} so'z, ${prevOnly.mistakes} xato\n\nHolat: <b>${arrow}</b>`,
      );
    }
    case "r_xp": {
      const pr = await prof(p.studentId);
      return send(
        `⚡ <b>${name} — XP va liga</b>\n\nJami XP: ${pr?.total_xp ?? 0}\nShu hafta: ${pr?.weekly_xp ?? 0}\nLiga: ${pr?.league ?? "—"}`,
      );
    }
    case "r_coins": {
      const pr = await prof(p.studentId);
      const { data: tx } = await supabaseAdmin
        .from("coin_transactions")
        .select("amount, reason, created_at")
        .eq("user_id", p.studentId)
        .order("created_at", { ascending: false })
        .limit(5);
      return send(
        `🪙 <b>${name} — tangalar</b>\n\nBalans: ${pr?.coins ?? 0}\n\n${(tx ?? [])
          .map((t) => `• ${(t.amount as number) > 0 ? "+" : ""}${t.amount} — ${esc(String(t.reason ?? ""))}`)
          .join("\n") || "Harakat yo'q."}`,
      );
    }
    case "r_best": {
      const pr = await prof(p.studentId);
      const all = await counts(p.studentId, "1970-01-01T00:00:00Z");
      return send(
        `🥇 <b>${name} — rekordlar</b>\n\n🔥 Eng uzun streak: ${pr?.best_streak ?? 0} kun\n📚 Jami so'z: ${all.learned}\n⚡ Jami XP: ${pr?.total_xp ?? 0}`,
      );
    }
    case "r_rank": {
      const g = await groupOf(p.studentId);
      if (!g) return send("📭 Farzandingiz hech qaysi guruhda emas.");
      const { data: members } = await supabaseAdmin
        .from("group_members")
        .select("student_id")
        .eq("group_id", g.id as string);
      const ids = (members ?? []).map((m) => m.student_id as string);
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("user_id, name, total_xp")
        .in("user_id", ids);
      const sorted = (profs ?? []).sort(
        (a, b) => ((b.total_xp as number) ?? 0) - ((a.total_xp as number) ?? 0),
      );
      const pos = sorted.findIndex((x) => x.user_id === p.studentId) + 1;
      return send(
        `👥 <b>${name} — guruhdagi o'rni</b>\n\nGuruh: ${esc(String(g.name))}\nO'rin: <b>${pos || "—"}</b> / ${sorted.length}\n\n${sorted
          .slice(0, 5)
          .map((x, i) => `${i + 1}. ${esc(String(x.name ?? "Ismsiz"))} — ${x.total_xp ?? 0} XP`)
          .join("\n")}`,
      );
    }
    case "t_list":
    case "t_done":
    case "t_late": {
      const g = await groupOf(p.studentId);
      if (!g) return send("📭 Farzandingiz hech qaysi guruhda emas.");
      const { data: list } = await supabaseAdmin
        .from("assignments")
        .select("id, title, due_date")
        .eq("group_id", g.id as string)
        .order("created_at", { ascending: false })
        .limit(20);
      const { data: done } = await supabaseAdmin
        .from("assignment_completions")
        .select("assignment_id, completed_at")
        .eq("student_id", p.studentId);
      const doneSet = new Set((done ?? []).map((d) => d.assignment_id as string));
      let rows = list ?? [];
      if (key === "t_done") rows = rows.filter((a) => doneSet.has(a.id as string));
      if (key === "t_late")
        rows = rows.filter(
          (a) => !doneSet.has(a.id as string) && a.due_date && new Date(a.due_date as string) < new Date(),
        );
      if (!rows.length) return send("📭 Bu bo'limda topshiriq yo'q.");
      return send(
        `📝 <b>${name} — topshiriqlar</b>\n\n${rows
          .map(
            (a) =>
              `${doneSet.has(a.id as string) ? "✅" : "🔸"} ${esc(String(a.title))}${a.due_date ? ` — muddat: ${a.due_date}` : ""}`,
          )
          .join("\n")}`,
      );
    }
    case "t_quiz": {
      const { data } = await supabaseAdmin
        .from("submissions")
        .select("kind, ai_score, created_at")
        .eq("student_id", p.studentId)
        .order("created_at", { ascending: false })
        .limit(8);
      if (!data?.length) return send("📭 Hozircha topshirilgan ish yo'q.");
      return send(
        `🎯 <b>${name} — natijalar</b>\n\n${data
          .map(
            (s) =>
              `• ${new Date(s.created_at as string).toLocaleDateString("uz-UZ")} — ${esc(String(s.kind))}: ${s.ai_score ?? "—"}`,
          )
          .join("\n")}`,
      );
    }
    case "c_write": {
      await setState(chatId, { mode: "parent_msg" });
      return send("✍️ Ustozga yuboradigan xabaringizni yozing:");
    }
    case "c_teacher": {
      const g = await groupOf(p.studentId);
      if (!g) return send("📭 Guruh topilmadi.");
      const { data: t } = await supabaseAdmin
        .from("profiles")
        .select("name, telegram_username")
        .eq("user_id", g.teacher_id as string)
        .maybeSingle();
      return send(
        `👨‍🏫 <b>Ustoz</b>\n\nIsm: ${esc(String(t?.name ?? "—"))}\nGuruh: ${esc(String(g.name))}\nDars kunlari: ${esc(String(g.lesson_days ?? "—"))}\nDars vaqti: ${esc(String(g.lesson_time ?? "—"))}${t?.telegram_username ? `\nTelegram: @${esc(String(t.telegram_username))}` : ""}`,
      );
    }
    case "c_msgs": {
      const g = await groupOf(p.studentId);
      if (!g) return send("📭 Guruh topilmadi.");
      const { data } = await supabaseAdmin
        .from("group_messages")
        .select("body, created_at")
        .eq("group_id", g.id as string)
        .order("created_at", { ascending: false })
        .limit(5);
      if (!data?.length) return send("📭 Xabarlar yo'q.");
      return send(
        `📢 <b>Guruh xabarlari</b>\n\n${data
          .map((m) => `• ${new Date(m.created_at as string).toLocaleDateString("uz-UZ")}: ${esc(String(m.body))}`)
          .join("\n\n")}`,
      );
    }
    case "s_freq": {
      return send(
        `🔔 <b>Hisobot chastotasi</b>\n\nHozir: <b>${p.notifyFreq === "daily" ? "har kuni" : p.notifyFreq === "off" ? "o'chirilgan" : "har hafta"}</b>`,
        [
          [
            { text: "Har kuni", callback_data: "pf:daily" },
            { text: "Har hafta", callback_data: "pf:weekly" },
            { text: "O'chirish", callback_data: "pf:off" },
          ],
        ],
      );
    }
    case "s_child": {
      const pr = await prof(p.studentId);
      return send(
        `👦 <b>Farzand ma'lumoti</b>\n\nIsm: ${esc(String(pr?.name ?? p.studentName))}\nYosh: ${pr?.age ?? "—"}\nJins: ${esc(String(pr?.gender ?? "—"))}\nDaraja: ${pr?.level_chosen ?? "—"}`,
      );
    }
    case "s_off": {
      return send("🔌 Kuzatuvni uzmoqchimisiz?", [
        [
          { text: "✅ Ha, uzish", callback_data: "pf:disconnect" },
          { text: "❌ Yo'q", callback_data: "pf:keep" },
        ],
      ]);
    }
    default:
      return parentMenu(chatId, p);
  }
}

/** pf:<action> — sozlama tugmalari. */
export async function parentSetting(chatId: number, p: ParentCtx, action: string): Promise<void> {
  if (action === "disconnect") {
    await supabaseAdmin.from("parent_links").update({ active: false }).eq("id", p.linkId);
    return void sendMessage(chatId, "🔌 Kuzatuv uzildi. Qayta ulash uchun administratordan yangi havola oling.", {
      removeKeyboard: true,
    });
  }
  if (action === "keep") return void sendMessage(chatId, "👍 Kuzatuv saqlanib qoldi.");
  if (["daily", "weekly", "off"].includes(action)) {
    await supabaseAdmin.from("parent_links").update({ notify_freq: action }).eq("id", p.linkId);
    return void sendMessage(
      chatId,
      `✅ Hisobot chastotasi: <b>${action === "daily" ? "har kuni" : action === "off" ? "o'chirilgan" : "har hafta"}</b>`,
    );
  }
}
