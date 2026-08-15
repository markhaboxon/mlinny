// Telegram bot update router: commands, callbacks, free text.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  answerCallback,
  editMessage,
  esc,
  sendChatAction,
  sendMessage,
  type Button,
} from "@/lib/telegram.server";
import {
  ai,
  chatIdOfUser,
  clearState,
  findUserByChat,
  getState,
  setState,
  SITE_URL,
  today,
  type BotUser,
} from "./core.server";
import { allowed, syncRoleCommands } from "./roles.server";
import { handleUnregistered, registrationHelp, startRegistration } from "./register.server";
import { parentByChat, parentItem, parentMenu, parentSetting, parentText } from "./parent.server";
import { resolveDevice } from "./security.server";
import {
  pokeStudent,
  teacherAbsent,
  teacherAssignSave,
  teacherAssignStart,
  teacherCurriculum,
  teacherGroupsList,
  teacherMaterials,
  teacherStudentCard,
  teacherTop,
} from "./teacher-extra.server";


type TgUser = { id: number; username?: string; first_name?: string };
type TgMessage = {
  message_id: number;
  chat: { id: number };
  from?: TgUser;
  text?: string;
  voice?: { file_id: string };
  photo?: { file_id: string }[];
};
type TgCallback = {
  id: string;
  data?: string;
  from: TgUser;
  message?: { message_id: number; chat: { id: number } };
};
export type TgUpdate = {
  update_id: number;
  message?: TgMessage;
  edited_message?: TgMessage;
  callback_query?: TgCallback;
};

const NEEDS_LINK = `👋 Salom! Bu <b>Linny AI</b> boti.

❌ Sizning hisobingiz topilmadi.

Hisobingizni ulash uchun administrator yoki ustozingiz bergan <b>shaxsiy havolani</b> bosishingiz kerak (havola <code>t.me/...?start=login_...</code> ko'rinishida bo'ladi). Parol kerak emas.

Havolangiz bo'lmasa administrator bilan bog'laning (@qiziqyabsizmi).`;


// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
export async function handleUpdate(update: TgUpdate) {
  const chatId = update.callback_query?.message?.chat?.id ?? update.message?.chat?.id ?? update.edited_message?.chat?.id;
  try {
    if (update.callback_query) return await handleCallback(update.callback_query);
    const msg = update.message ?? update.edited_message;
    if (msg) return await handleMessage(msg);
  } catch (e) {
    // Hech qachon "jim" qolmaslik uchun: xatolikda ham foydalanuvchiga javob boradi.
    console.error("bot update error", e);
    if (chatId) {
      await sendMessage(
        chatId,
        "⚠️ Buyruqni bajarishda xatolik yuz berdi. Bir daqiqadan keyin qayta urinib ko'ring.",
      ).catch(() => {});
    }
  }
}


async function handleMessage(msg: TgMessage) {
  const chatId = msg.chat.id;
  const text = (msg.text ?? "").trim();

  if (text.startsWith("/start")) return handleStart(chatId, msg.from, text);

  const user = await findUserByChat(chatId);
  if (!user) {
    // Ota-ona?
    const parent = await parentByChat(chatId);
    if (parent) {
      if (await parentText(chatId, parent, text)) return;
      return parentMenu(chatId, parent);
    }
    // Hech qanday rolga bog'lanmagan foydalanuvchi.
    return handleUnregistered(chatId, msg.from?.username, text);
  }

  await syncRoleCommands(user);
  if (msg.voice) return handleVoice(user, msg.voice.file_id);
  if (msg.photo?.length) return handlePhoto(user);

  if (text.startsWith("/")) return handleCommand(user, text);
  return handleFreeText(user, text);
}


// ---------------------------------------------------------------------------
// /start + account linking
// ---------------------------------------------------------------------------
async function handleStart(chatId: number, from: TgUser | undefined, text: string) {
  const token = text.split(/\s+/)[1]?.trim();
  const existing = await findUserByChat(chatId);

  // Ota-ona havolasi: parent_<token> (eski format: p_<token>)
  const parentToken = token?.startsWith("parent_")
    ? token.slice(7)
    : token?.startsWith("p_")
      ? token.slice(2)
      : null;
  if (parentToken) {
    const { data: pl } = await supabaseAdmin
      .from("parent_links")
      .select("id, account_id, active, telegram_id")
      .eq("token", parentToken)
      .maybeSingle();
    if (!pl || !pl.active)
      return void sendMessage(chatId, "❌ Bu havola endi amal qilmaydi. Administratorga murojaat qiling.");
    if (pl.telegram_id && pl.telegram_id !== chatId)
      return void sendMessage(chatId, "❌ Bu havola allaqachon ishlatilgan.");
    await supabaseAdmin
      .from("parent_links")
      .update({ telegram_id: chatId, linked_at: new Date().toISOString() })
      .eq("id", pl.id as string);
    const p = await parentByChat(chatId);
    if (!p) return void sendMessage(chatId, "❌ Hisob topilmadi.");
    await sendMessage(chatId, "✅ Ota-ona kuzatuvi ulandi!");
    return parentMenu(chatId, p);
  }

  // O'quvchi/ustoz kirish havolasi: login_<token>
  if (token?.startsWith("login_")) {
    const raw = token.slice(6);
    const { data: link } = await supabaseAdmin
      .from("access_links")
      .select("id, account_id, used_at")
      .eq("token", raw)
      .maybeSingle();
    if (!link)
      return void sendMessage(chatId, "❌ Bu havola endi amal qilmaydi. Administratorga murojaat qiling.");
    if (link.used_at) return void sendMessage(chatId, "❌ Bu havola allaqachon ishlatilgan.");

    const { data: acc } = await supabaseAdmin
      .from("app_accounts")
      .select("id, user_id, full_name, kind, active")
      .eq("id", link.account_id as string)
      .maybeSingle();
    if (!acc?.user_id || !acc.active)
      return void sendMessage(chatId, "❌ Hisob topilmadi yoki bloklangan. Administratorga murojaat qiling.");

    const { data: taken } = await supabaseAdmin
      .from("profiles")
      .select("user_id")
      .eq("telegram_id", chatId)
      .maybeSingle();
    if (taken && taken.user_id !== acc.user_id)
      return void sendMessage(chatId, "⚠️ Bu Telegram akkaunt boshqa hisobga ulangan.");

    await supabaseAdmin
      .from("profiles")
      .update({
        telegram_id: chatId,
        telegram_username: from?.username ?? null,
        telegram_linked_at: new Date().toISOString(),
      })
      .eq("user_id", acc.user_id as string);

    const name = (acc.full_name as string) ?? "";
    const user = await findUserByChat(chatId);
    await sendMessage(
      chatId,
      `✅ Xush kelibsiz${name ? `, <b>${esc(name.split(" ")[0]!)}</b>` : ""}!\n\nSaytga kirish uchun quyidagi tugmani bosing — login yoki parol kerak emas.`,
      { buttons: [[{ text: "🌐 Saytga kirish", url: `${SITE_URL}/enter/${raw}` }]] },
    );
    if (user) return void sendMessage(chatId, greeting(user), { buttons: mainMenu(user) });
    return;
  }


  if (token) {
    const { data: link } = await supabaseAdmin
      .from("telegram_links")
      .select("id, user_id, used_at, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (!link) return void sendMessage(chatId, "❌ Havola noto'g'ri. Saytdan yangi havola oling.");

    if (link.used_at)
      return void sendMessage(chatId, "❌ Bu havola allaqachon ishlatilgan. Saytdan yangi havola oling.");
    if (new Date(link.expires_at) < new Date())
      return void sendMessage(chatId, "❌ Havola muddati tugagan. Saytdan yangi havola oling.");

    if (existing && existing.userId !== link.user_id)
      return void sendMessage(
        chatId,
        "⚠️ Bu Telegram akkaunt boshqa hisobga ulangan. Avval /unlink buyrug'i bilan uzing.",
      );

    // one Telegram account = one site account
    const { data: taken } = await supabaseAdmin
      .from("profiles")
      .select("user_id")
      .eq("telegram_id", chatId)
      .maybeSingle();
    if (taken && taken.user_id !== link.user_id)
      return void sendMessage(chatId, "⚠️ Bu Telegram akkaunt boshqa hisobga ulangan.");

    await supabaseAdmin
      .from("profiles")
      .update({
        telegram_id: chatId,
        telegram_username: from?.username ?? null,
        telegram_linked_at: new Date().toISOString(),
      })
      .eq("user_id", link.user_id);
    await supabaseAdmin
      .from("telegram_links")
      .update({ used_at: new Date().toISOString() })
      .eq("id", link.id);

    const user = await findUserByChat(chatId);
    return void sendMessage(
      chatId,
      `✅ Hisobingiz ulandi!\n\n${greeting(user!)}`,
      { buttons: mainMenu(user!) },
    );
  }

  if (existing) {
    await syncRoleCommands(existing);
    return void sendMessage(chatId, greeting(existing), { buttons: mainMenu(existing) });
  }
  {
    const p = await parentByChat(chatId);
    if (p) return parentMenu(chatId, p);
  }

  await sendMessage(chatId, NEEDS_LINK);
  return handleUnregistered(chatId, from?.username, "");
}


function greeting(u: BotUser) {
  const role = u.kind === "teacher" ? "Ustoz" : u.kind === "admin" ? "Admin" : "O'quvchi";
  return `👋 Salom${u.name ? `, <b>${esc(u.name)}</b>` : ""}! (${role})\n\nQuyidagi tugmalardan foydalaning yoki /help ni bosing.`;
}

function mainMenu(u: BotUser): Button[][] {
  if (u.kind === "teacher" || u.kind === "admin")
    return [
      [
        { text: "👥 O'quvchilar", callback_data: "students" },
        { text: "📊 Hisobot", callback_data: "report" },
      ],
      [
        { text: "🏫 Guruhlarim", callback_data: "groups" },
        { text: "🏆 Reyting", callback_data: "top" },
      ],
      [
        { text: "⛔️ Bugun kelmaganlar", callback_data: "absent" },
        { text: "📝 Topshiriq berish", callback_data: "assign" },
      ],
      [
        { text: "📢 Xabar yuborish", callback_data: "send" },
        { text: "🔗 Taklif havolasi", callback_data: "invite" },
      ],
      [{ text: "🌐 Saytga o'tish", url: SITE_URL }],
    ];

  return [
    [
      { text: "📚 Bugungi so'zlar", callback_data: "words" },
      { text: "🎯 Viktorina", callback_data: "quiz" },
    ],
    [
      { text: "📈 Progress", callback_data: "progress" },
      { text: "⭐ Sevimli so'zlar", callback_data: "vocab" },
    ],
    [
      { text: "📝 Topshiriqlar", callback_data: "assignments" },
      { text: "🧠 Zaif joylarim", callback_data: "weak" },
    ],
    [
      { text: "📖 Hikoya", callback_data: "story" },
      { text: "⚙️ Sozlamalar", callback_data: "settings" },
    ],
    [{ text: "🌐 Saytga o'tish", url: SITE_URL }],
  ];
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------
async function handleCommand(u: BotUser, text: string) {
  const [raw, ...rest] = text.split(/\s+/);
  const cmd = raw!.replace(/@.*$/, "").toLowerCase();
  const arg = rest.join(" ").trim();

  // Rolga tegishli bo'lmagan buyruq umuman tanilmaydi.
  if (!allowed(u.kind, cmd))
    return void sendMessage(u.chatId, "❓ Bunday buyruq yo'q. /help ni bosing.", {
      buttons: mainMenu(u),
    });

  switch (cmd) {

    case "/help":
      return void sendMessage(u.chatId, helpText(u), { buttons: mainMenu(u) });
    case "/menu":
      return void sendMessage(u.chatId, greeting(u), { buttons: mainMenu(u) });
    case "/profile":
      return profile(u);
    case "/progress":
      return progress(u);
    case "/words":
      return todaysWords(u);
    case "/vocab":
      return favorites(u);
    case "/quiz":
      return startQuiz(u);
    case "/assignments":
      return assignments(u);
    case "/settings":
      return settings(u);
    case "/story":
      return story(u);
    case "/weak":
      return weakSpots(u);
    case "/sentence":
      return sentenceTask(u);
    case "/ask":
      if (!arg) {
        await setState(u.chatId, { mode: "ask" });
        return void sendMessage(u.chatId, "❓ Savolingizni yozing:");
      }
      return askAi(u, arg);
    case "/unlink":
      await supabaseAdmin
        .from("profiles")
        .update({ telegram_id: null, telegram_username: null, telegram_linked_at: null })
        .eq("user_id", u.userId);
      await clearState(u.chatId);
      return void sendMessage(u.chatId, "🔌 Telegram hisobi uzildi.");
    case "/students":
      return teacherOnly(u, () => students(u));
    case "/report":
      return teacherOnly(u, () => report(u));
    case "/send":
      return teacherOnly(u, async () => {
        if (arg) return broadcast(u, arg, null);
        await setState(u.chatId, { mode: "send" });
        return void sendMessage(u.chatId, "📢 Barcha guruhlaringizga yuboriladigan xabarni yozing:");
      });
    case "/invite":
      return teacherOnly(u, () => invite(u));
    case "/schedule":
      return teacherOnly(u, async () => {
        await setState(u.chatId, { mode: "schedule" });
        return void sendMessage(
          u.chatId,
          "🕒 Formatda yozing:\n<code>SOAT:DAQIQA xabar matni</code>\nMasalan: <code>09:00 Ertaga darsga kitob olib keling</code>",
        );
      });
    case "/groups":
      return teacherOnly(u, () => teacherGroupsList(u));
    case "/student":
      return teacherOnly(u, () => teacherStudentCard(u, arg));
    case "/top":
      return teacherOnly(u, () => teacherTop(u));
    case "/absent":
      return teacherOnly(u, () => teacherAbsent(u));
    case "/assign":
      return teacherOnly(u, () => teacherAssignStart(u));
    case "/materials":
      return teacherOnly(u, () => teacherMaterials(u));
    case "/curriculum":
      return teacherOnly(u, () => teacherCurriculum(u));
    case "/stats":
      if (u.kind !== "admin") return void sendMessage(u.chatId, "🔒 Bu buyruq faqat admin uchun.");
      return adminStats(u);
    default:
      return void sendMessage(u.chatId, "❓ Bunday buyruq yo'q. /help ni bosing.");
  }
}


function teacherOnly(u: BotUser, fn: () => Promise<unknown> | unknown) {
  if (u.kind !== "teacher" && u.kind !== "admin")
    return void sendMessage(u.chatId, "🔒 Bu buyruq faqat ustozlar uchun.");
  return fn();
}

function helpText(u: BotUser) {
  if (u.kind === "teacher" || u.kind === "admin")
    return `📖 <b>Ustoz buyruqlari</b>

/students — o'quvchilar va bugungi holat
/groups — guruhlarim (kod, dars kunlari, o'quvchi soni)
/student ISM — bitta o'quvchi bo'yicha to'liq ma'lumot
/top — eng faol o'quvchilar reytingi
/absent — bugun mashq qilmaganlar + eslatma yuborish
/assign — yangi topshiriq berish
/materials — dars materiallari
/curriculum — dars rejasi holati
/report — haftalik AI-xulosali hisobot
/send — barcha guruhlarga xabar yuborish
/schedule — xabarni belgilangan vaqtga rejalashtirish
/invite — guruhga qo'shilish kodlari
/ask — AI'dan erkin savol (masalan: "Alisher haftada nechta so'z yodladi?")
/profile — hisobingiz
/menu — asosiy menyu${u.kind === "admin" ? "\n/stats — umumiy tizim statistikasi" : ""}`;


  return `📖 <b>Buyruqlar</b>

/words — bugungi so'zlar
/quiz — tezkor viktorina
/progress — daraja, streak, o'rganilgan so'zlar
/vocab — sevimli so'zlar
/assignments — topshiriqlar
/sentence — "shu so'z bilan gap tuzing" mashqi
/story — bugungi so'zlardan mini-hikoya
/weak — zaif joylar tahlili
/ask — AI'dan istalgan savol
/settings — kunlik yuborish vaqti va eslatmalar
/menu — asosiy menyu`;
}

// ---------------------------------------------------------------------------
// Student features
// ---------------------------------------------------------------------------
async function profile(u: BotUser) {
  const { count: learned } = await supabaseAdmin
    .from("learned_words")
    .select("id", { count: "exact", head: true })
    .eq("user_id", u.userId);
  return void sendMessage(
    u.chatId,
    `👤 <b>${esc(u.name ?? "Ismsiz")}</b>
Rol: ${u.kind === "teacher" ? "Ustoz" : u.kind === "admin" ? "Admin" : "O'quvchi"}
Daraja: ${u.level ?? "belgilanmagan"}
🔥 Streak: ${u.streak} kun
📚 O'rganilgan so'zlar: ${learned ?? 0}`,
    { buttons: mainMenu(u) },
  );
}

async function progress(u: BotUser) {
  const [{ count: learned }, { count: mistakes }, { data: prof }, { data: days }] = await Promise.all([
    supabaseAdmin.from("learned_words").select("id", { count: "exact", head: true }).eq("user_id", u.userId),
    supabaseAdmin.from("mistakes").select("id", { count: "exact", head: true }).eq("user_id", u.userId),
    supabaseAdmin
      .from("profiles")
      .select("streak, best_streak, last_visit, level_chosen")
      .eq("user_id", u.userId)
      .maybeSingle(),
    supabaseAdmin
      .from("daily_progress")
      .select("day")
      .eq("user_id", u.userId)
      .gte("day", new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)),
  ]);
  const acc =
    (learned ?? 0) + (mistakes ?? 0) === 0
      ? 0
      : Math.round((100 * (learned ?? 0)) / ((learned ?? 0) + (mistakes ?? 0)));
  return void sendMessage(
    u.chatId,
    `📈 <b>Progress</b>

Daraja: ${prof?.level_chosen ?? "—"}
🔥 Streak: ${prof?.streak ?? 0} kun (rekord: ${prof?.best_streak ?? 0})
📚 O'rganilgan so'zlar: ${learned ?? 0}
❌ Xatolar: ${mistakes ?? 0}
🎯 Aniqlik: ${acc}%
📅 So'nggi 7 kunda faol: ${days?.length ?? 0} kun
🕐 Oxirgi faollik: ${prof?.last_visit ?? "—"}`,
    { buttons: mainMenu(u) },
  );
}

async function todaysWords(u: BotUser) {
  const { data } = await supabaseAdmin
    .from("vocab_words")
    .select("id, word, translation, example, is_favorite")
    .eq("user_id", u.userId)
    .eq("assigned_date", today())
    .limit(12);

  if (!data?.length)
    return void sendMessage(
      u.chatId,
      "📭 Bugun uchun so'zlar hali tayyorlanmagan. Saytga kirib bugungi darsni boshlang.",
      { buttons: [[{ text: "🌐 Saytga o'tish", url: SITE_URL }]] },
    );

  const body = data
    .map(
      (w, i) =>
        `${i + 1}. <b>${esc(w.word)}</b> — ${esc(w.translation)}${w.example ? `\n   <i>${esc(w.example)}</i>` : ""}`,
    )
    .join("\n");
  return void sendMessage(u.chatId, `📚 <b>Bugungi so'zlar</b>\n\n${body}`, {
    buttons: [
      [{ text: "🎯 Shu so'zlardan test", callback_data: "quiz" }],
      [{ text: "📖 Hikoya yasash", callback_data: "story" }],
    ],
  });
}

async function favorites(u: BotUser) {
  const { data } = await supabaseAdmin
    .from("vocab_words")
    .select("id, word, translation")
    .eq("user_id", u.userId)
    .eq("is_favorite", true)
    .order("favorited_at", { ascending: false })
    .limit(20);

  if (!data?.length) return void sendMessage(u.chatId, "⭐ Sevimli so'zlar yo'q.");
  const body = data.map((w, i) => `${i + 1}. <b>${esc(w.word)}</b> — ${esc(w.translation)}`).join("\n");
  const buttons: Button[][] = data
    .slice(0, 10)
    .map((w) => [{ text: `🗑 ${w.word}`, callback_data: `unfav:${w.id}` }]);
  return void sendMessage(u.chatId, `⭐ <b>Sevimli so'zlar</b>\n\n${body}`, { buttons });
}

type QuizItem = { word: string; correct: string; choices: string[]; answer: number };

async function startQuiz(u: BotUser) {
  const { data } = await supabaseAdmin
    .from("vocab_words")
    .select("word, translation")
    .eq("user_id", u.userId)
    .order("created_at", { ascending: false })
    .limit(60);

  if (!data || data.length < 4)
    return void sendMessage(u.chatId, "🎯 Test uchun so'zlar yetarli emas. Avval saytda bir necha dars bajaring.");

  const pool = [...data].sort(() => Math.random() - 0.5).slice(0, 7);
  const items: QuizItem[] = pool.map((w) => {
    const wrong = data
      .filter((x) => x.translation !== w.translation)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3)
      .map((x) => x.translation);
    const choices = [...wrong, w.translation].sort(() => Math.random() - 0.5);
    return { word: w.word, correct: w.translation, choices, answer: choices.indexOf(w.translation) };
  });

  await setState(u.chatId, { quiz: { items, i: 0, score: 0 } });
  return sendQuizQuestion(u.chatId, items, 0, 0);
}

async function sendQuizQuestion(chatId: number, items: QuizItem[], i: number, score: number, messageId?: number) {
  const it = items[i]!;
  const text = `🎯 <b>Savol ${i + 1}/${items.length}</b>\n\n<b>${esc(it.word)}</b> — tarjimasi qaysi?`;
  const buttons: Button[][] = it.choices.map((c, ci) => [{ text: c, callback_data: `qa:${ci}` }]);
  if (messageId) await editMessage(chatId, messageId, text, buttons);
  else await sendMessage(chatId, text, { buttons });
  void score;
}

async function assignments(u: BotUser) {
  const { data: member } = await supabaseAdmin
    .from("group_members")
    .select("group_id")
    .eq("student_id", u.userId)
    .maybeSingle();
  if (!member) return void sendMessage(u.chatId, "📭 Siz hech qaysi guruhda emassiz.");

  const { data } = await supabaseAdmin
    .from("assignments")
    .select("id, title, topic, due_date, note")
    .eq("group_id", member.group_id)
    .order("created_at", { ascending: false })
    .limit(10);
  if (!data?.length) return void sendMessage(u.chatId, "📭 Hozircha topshiriq yo'q.");

  const { data: done } = await supabaseAdmin
    .from("assignment_completions")
    .select("assignment_id")
    .eq("student_id", u.userId);
  const doneSet = new Set((done ?? []).map((d) => d.assignment_id));

  const body = data
    .map(
      (a) =>
        `${doneSet.has(a.id) ? "✅" : "🔸"} <b>${esc(a.title)}</b>${a.due_date ? ` — muddat: ${a.due_date}` : ""}${a.note ? `\n   ${esc(a.note)}` : ""}`,
    )
    .join("\n");
  const buttons: Button[][] = data
    .filter((a) => !doneSet.has(a.id))
    .slice(0, 5)
    .map((a) => [{ text: `✅ ${a.title.slice(0, 28)}`, callback_data: `done:${a.id}` }]);
  return void sendMessage(u.chatId, `📝 <b>Topshiriqlar</b>\n\n${body}`, { buttons });
}

async function settings(u: BotUser) {
  return void sendMessage(
    u.chatId,
    `⚙️ <b>Sozlamalar</b>\n\nKunlik so'zlar vaqti: <b>${String(u.tgDailyHour).padStart(2, "0")}:00</b>\nKechki eslatma: <b>${u.tgReminders ? "yoqilgan" : "o'chirilgan"}</b>`,
    {
      buttons: [
        [
          { text: "07:00", callback_data: "hour:7" },
          { text: "08:00", callback_data: "hour:8" },
          { text: "09:00", callback_data: "hour:9" },
        ],
        [
          { text: "12:00", callback_data: "hour:12" },
          { text: "18:00", callback_data: "hour:18" },
          { text: "20:00", callback_data: "hour:20" },
        ],
        [
          {
            text: u.tgReminders ? "🔕 Eslatmani o'chirish" : "🔔 Eslatmani yoqish",
            callback_data: `rem:${u.tgReminders ? 0 : 1}`,
          },
        ],
      ],
    },
  );
}

async function story(u: BotUser) {
  await sendChatAction(u.chatId);
  const { data } = await supabaseAdmin
    .from("vocab_words")
    .select("word")
    .eq("user_id", u.userId)
    .eq("assigned_date", today())
    .limit(8);
  const words = (data ?? []).map((w) => w.word);
  if (!words.length) return void sendMessage(u.chatId, "📭 Bugungi so'zlar yo'q. Avval saytda darsni boshlang.");

  const text = await ai(
    u.userId,
    "Siz ingliz tili o'qituvchisisiz. Qisqa, qiziqarli va sodda mini-hikoya yozasiz.",
    `Quyidagi so'zlarning barchasini ishlatib 3-4 gapli qiziqarli inglizcha mini-hikoya yozing: ${words.join(", ")}.
Formati:
1) Inglizcha hikoya (ishlatilgan so'zlarni <b>qalin</b> qiling)
2) Bo'sh qator
3) O'zbekcha tarjimasi.
Faqat shu, ortiqcha izoh yo'q.`,
    { cacheKey: `story:${u.userId}:${today()}` },
  );
  return void sendMessage(u.chatId, `📖 <b>Bugungi so'zlardan hikoya</b>\n\n${text}`);
}

async function weakSpots(u: BotUser) {
  await sendChatAction(u.chatId);
  const { data } = await supabaseAdmin
    .from("mistakes")
    .select("question, correct_answer, wrong_answer, tag")
    .eq("user_id", u.userId)
    .order("created_at", { ascending: false })
    .limit(40);
  if (!data?.length) return void sendMessage(u.chatId, "🎉 Hozircha xatolaringiz yo'q — zo'r!");

  const list = data
    .map((m) => `- ${m.tag ?? "umumiy"}: "${m.question}" → to'g'ri: ${m.correct_answer}, siz: ${m.wrong_answer ?? "-"}`)
    .join("\n");
  const text = await ai(
    u.userId,
    "Siz ingliz tili ustozisiz. O'zbek tilida qisqa, aniq va rag'batlantiruvchi tahlil berasiz.",
    `O'quvchining so'nggi xatolari:\n${list}\n\n3 ta eng zaif mavzuni aniqlang va har biri uchun 1 gaplik amaliy maslahat bering. Qisqa, ro'yxat shaklida.`,
    { cacheKey: `weak:${u.userId}:${today()}` },
  );
  return void sendMessage(u.chatId, `🧠 <b>Zaif joylar tahlili</b>\n\n${text}`);
}

async function sentenceTask(u: BotUser) {
  const { data } = await supabaseAdmin
    .from("vocab_words")
    .select("word, translation")
    .eq("user_id", u.userId)
    .order("created_at", { ascending: false })
    .limit(40);
  if (!data?.length) return void sendMessage(u.chatId, "📭 So'zlar yo'q. Avval saytda dars boshlang.");
  const w = data[Math.floor(Math.random() * data.length)]!;
  await setState(u.chatId, { mode: "sentence", sentenceWord: w.word });
  return void sendMessage(
    u.chatId,
    `✍️ <b>${esc(w.word)}</b> (${esc(w.translation)}) so'zi bilan inglizcha gap tuzing va yuboring.`,
  );
}

async function askAi(u: BotUser, question: string) {
  await sendChatAction(u.chatId);

  if (u.kind === "teacher" || u.kind === "admin") {
    const context = await teacherContext(u.userId);
    const text = await ai(
      u.userId,
      "Siz o'quv markazi yordamchisisiz. Faqat berilgan ma'lumotlarga tayanib, o'zbek tilida qisqa javob berasiz. Ma'lumot yetmasa, ochiq ayting.",
      `Ma'lumotlar:\n${context}\n\nUstozning savoli: ${question}`,
    );
    return void sendMessage(u.chatId, text);
  }

  const text = await ai(
    u.userId,
    "Siz Linny — o'zbek o'quvchilariga ingliz tilini o'rgatuvchi do'stona ustozsiz. Javoblar qisqa, sodda va o'zbek tilida (inglizcha misollar bilan).",
    question,
    { cacheKey: `ask:${question.toLowerCase().slice(0, 120)}` },
  );
  return void sendMessage(u.chatId, text);
}

async function handleVoice(u: BotUser, _fileId: string) {
  return void sendMessage(
    u.chatId,
    "🎤 Ovozli mashqlar hozircha saytdagi <b>Shadowing</b> rejimida ishlaydi. Botda tez orada qo'shiladi.",
    { buttons: [[{ text: "🌐 Shadowing", url: SITE_URL }]] },
  );
}

async function handlePhoto(u: BotUser) {
  return void sendMessage(u.chatId, "🖼 Rasmli mashq tez orada qo'shiladi. Hozircha /quiz yoki /sentence sinab ko'ring.");
}

// ---------------------------------------------------------------------------
// Teacher features
// ---------------------------------------------------------------------------
async function teacherGroups(userId: string) {
  const { data } = await supabaseAdmin
    .from("groups")
    .select("id, name, archived")
    .eq("teacher_id", userId)
    .eq("archived", false);
  return data ?? [];
}

async function teacherContext(userId: string) {
  const groups = await teacherGroups(userId);
  if (!groups.length) return "Ustozda faol guruh yo'q.";
  const lines: string[] = [];
  for (const g of groups) {
    const { data: members } = await supabaseAdmin
      .from("group_members")
      .select("student_id")
      .eq("group_id", g.id);
    const ids = (members ?? []).map((m) => m.student_id);
    if (!ids.length) {
      lines.push(`Guruh "${g.name}": o'quvchi yo'q`);
      continue;
    }
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("user_id, name, streak, last_visit, level_chosen")
      .in("user_id", ids);
    for (const p of profs ?? []) {
      const { count: learned } = await supabaseAdmin
        .from("learned_words")
        .select("id", { count: "exact", head: true })
        .eq("user_id", p.user_id);
      const { count: weekWords } = await supabaseAdmin
        .from("learned_words")
        .select("id", { count: "exact", head: true })
        .eq("user_id", p.user_id)
        .gte("created_at", new Date(Date.now() - 7 * 864e5).toISOString());
      const { count: mistakes } = await supabaseAdmin
        .from("mistakes")
        .select("id", { count: "exact", head: true })
        .eq("user_id", p.user_id)
        .gte("created_at", new Date(Date.now() - 7 * 864e5).toISOString());
      lines.push(
        `Guruh "${g.name}" — ${p.name ?? "Ismsiz"}: daraja ${p.level_chosen ?? "-"}, streak ${p.streak ?? 0}, jami so'z ${learned ?? 0}, shu hafta so'z ${weekWords ?? 0}, shu hafta xato ${mistakes ?? 0}, oxirgi faollik ${p.last_visit ?? "-"}`,
      );
    }
  }
  return lines.join("\n");
}

async function students(u: BotUser) {
  const groups = await teacherGroups(u.userId);
  if (!groups.length) return void sendMessage(u.chatId, "📭 Sizda faol guruh yo'q.");
  const t = today();
  const blocks: string[] = [];
  for (const g of groups) {
    const { data: members } = await supabaseAdmin
      .from("group_members")
      .select("student_id")
      .eq("group_id", g.id);
    const ids = (members ?? []).map((m) => m.student_id);
    if (!ids.length) {
      blocks.push(`<b>${esc(g.name)}</b>\n  (o'quvchi yo'q)`);
      continue;
    }
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("user_id, name, streak, last_visit")
      .in("user_id", ids);
    const rows = (profs ?? [])
      .map(
        (p) =>
          `  ${p.last_visit === t ? "✅" : "⛔️"} ${esc(p.name ?? "Ismsiz")} — 🔥${p.streak ?? 0}, oxirgi: ${p.last_visit ?? "—"}`,
      )
      .join("\n");
    blocks.push(`<b>${esc(g.name)}</b>\n${rows}`);
  }
  return void sendMessage(u.chatId, `👥 <b>O'quvchilar (bugun)</b>\n\n${blocks.join("\n\n")}`);
}

async function report(u: BotUser) {
  await sendChatAction(u.chatId);
  const context = await teacherContext(u.userId);
  const text = await ai(
    u.userId,
    "Siz o'quv markazi tahlilchisisiz. O'zbek tilida qisqa, aniq va amaliy haftalik hisobot yozasiz.",
    `Haftalik ma'lumotlar:\n${context}\n\nQisqa hisobot yozing: 1) umumiy holat, 2) eng faol va eng orqada qolgan o'quvchilar, 3) 2-3 ta aniq tavsiya.`,
  );
  return void sendMessage(u.chatId, `📊 <b>Haftalik hisobot</b>\n\n${text}`);
}

export async function broadcast(u: BotUser, body: string, groupId: string | null) {
  const groups = groupId ? [{ id: groupId, name: "" }] : await teacherGroups(u.userId);
  if (!groups.length) return void sendMessage(u.chatId, "📭 Guruh topilmadi.");

  let sent = 0;
  for (const g of groups) {
    await supabaseAdmin.from("group_messages").insert({ teacher_id: u.userId, group_id: g.id, body });
    const { data: members } = await supabaseAdmin
      .from("group_members")
      .select("student_id")
      .eq("group_id", g.id);
    for (const m of members ?? []) {
      await supabaseAdmin.from("notifications").insert({
        recipient_id: m.student_id,
        group_id: g.id,
        title: "Ustozdan xabar",
        body,
      });
      const chat = await chatIdOfUser(m.student_id);
      if (chat) {
        await sendMessage(chat, `📢 <b>Ustozdan xabar</b>\n\n${esc(body)}`);
        sent++;
      }
    }
  }
  return void sendMessage(u.chatId, `✅ Xabar saqlandi. Telegram orqali ${sent} ta o'quvchiga yetkazildi.`);
}

async function invite(u: BotUser) {
  const groups = await teacherGroups(u.userId);
  if (!groups.length) return void sendMessage(u.chatId, "📭 Avval saytda guruh yarating.");
  const { data } = await supabaseAdmin
    .from("groups")
    .select("name, join_code")
    .eq("teacher_id", u.userId)
    .eq("archived", false);
  const body = (data ?? [])
    .map((g) => `<b>${esc(g.name)}</b> — kod: <code>${g.join_code}</code>`)
    .join("\n");
  return void sendMessage(
    u.chatId,
    `🔗 <b>Guruhga qo'shilish kodlari</b>\n\n${body}\n\nO'quvchi ${SITE_URL}/group sahifasida shu kodni kiritadi.`,
  );
}

async function adminStats(u: BotUser) {
  const [{ count: accounts }, { count: groups }, { count: linked }] = await Promise.all([
    supabaseAdmin.from("app_accounts").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("groups").select("id", { count: "exact", head: true }).eq("archived", false),
    supabaseAdmin.from("profiles").select("user_id", { count: "exact", head: true }).not("telegram_id", "is", null),
  ]);
  const { count: activeToday } = await supabaseAdmin
    .from("daily_progress")
    .select("id", { count: "exact", head: true })
    .eq("day", today());
  return void sendMessage(
    u.chatId,
    `🛠 <b>Tizim statistikasi</b>\n\nHisoblar: ${accounts ?? 0}\nFaol guruhlar: ${groups ?? 0}\nBotga ulanganlar: ${linked ?? 0}\nBugun faol: ${activeToday ?? 0}`,
  );
}

// ---------------------------------------------------------------------------
// Free text (state machine)
// ---------------------------------------------------------------------------
async function handleFreeText(u: BotUser, text: string) {
  if (!text) return;
  const state = await getState(u.chatId);
  const mode = state["mode"] as string | undefined;

  if (mode === "ask") {
    await clearState(u.chatId, ["mode"]);
    return askAi(u, text);
  }

  if (mode === "send") {
    await clearState(u.chatId, ["mode"]);
    return broadcast(u, text, null);
  }

  if (mode === "student_search") {
    await clearState(u.chatId, ["mode"]);
    return teacherStudentCard(u, text);
  }

  if (mode === "assign") return teacherAssignSave(u, text);



  if (mode === "schedule") {
    const m = text.match(/^(\d{1,2}):(\d{2})\s+([\s\S]+)$/);
    if (!m) return void sendMessage(u.chatId, "❌ Format noto'g'ri. Masalan: <code>09:00 Matn</code>");
    await clearState(u.chatId, ["mode"]);
    const now = new Date();
    const when = new Date(now);
    when.setHours(Number(m[1]), Number(m[2]), 0, 0);
    if (when <= now) when.setDate(when.getDate() + 1);
    await supabaseAdmin.from("scheduled_messages").insert({
      teacher_id: u.userId,
      group_id: null,
      body: m[3]!.trim(),
      send_at: when.toISOString(),
    });
    return void sendMessage(u.chatId, `✅ Xabar rejalashtirildi: ${when.toLocaleString("uz-UZ")}`);
  }

  if (mode === "sentence") {
    const word = state["sentenceWord"] as string;
    await clearState(u.chatId, ["mode", "sentenceWord"]);
    await sendChatAction(u.chatId);
    const feedback = await ai(
      u.userId,
      "Siz mehribon ingliz tili ustozisiz. O'zbek tilida qisqa fikr-mulohaza berasiz.",
      `O'quvchi "${word}" so'zi bilan quyidagi gapni tuzdi:\n"${text}"\n\n1) To'g'ri/noto'g'riligini ayting, 2) nima yaxshi bo'lganini ayting, 3) tuzatilgan variantni bering. Juda qisqa.`,
    );
    return void sendMessage(u.chatId, feedback, {
      buttons: [[{ text: "🔁 Yana mashq", callback_data: "sentence" }]],
    });
  }

  return askAi(u, text);
}

// ---------------------------------------------------------------------------
// Callbacks
// ---------------------------------------------------------------------------
async function handleCallback(cb: TgCallback) {
  const chatId = cb.message?.chat.id;
  if (!chatId) return void answerCallback(cb.id);
  const u = await findUserByChat(chatId);

  if (!u) {
    await answerCallback(cb.id);
    const d = cb.data ?? "";
    const p = await parentByChat(chatId);
    if (p) {
      if (d.startsWith("pi:")) return parentItem(chatId, p, d.slice(3));
      if (d.startsWith("pf:")) return parentSetting(chatId, p, d.slice(3));
      if (d.startsWith("pr:")) return parentItem(chatId, p, d === "pr:today" ? "a_today" : "p_week");
      return parentMenu(chatId, p);
    }
    if (d === "reg:help") return registrationHelp(chatId);
    if (d === "reg:start") return startRegistration(chatId);
    return handleUnregistered(chatId, cb.from.username, "");
  }
  const data = cb.data ?? "";
  await answerCallback(cb.id);

  // Yangi qurilma tasdiqlash / rad etish
  if (data.startsWith("dv:")) {
    const [, act, id] = data.split(":");
    const approve = act === "ok";
    const r = await resolveDevice(id!, u.userId, approve);
    if (!r.ok) return void sendMessage(chatId, "❌ Qurilma topilmadi.");
    return void sendMessage(
      chatId,
      approve
        ? "✅ Rahmat! Qurilma ishonchli deb belgilandi."
        : "🚫 Kirish bekor qilindi va sessiya tugatildi. Hisobingiz xavfsiz.",
    );
  }

  if (data.startsWith("poke:")) return teacherOnly(u, () => pokeStudent(u, data.slice(5)));


  // Saytga kirish so'rovini tasdiqlash / rad etish
  if (data.startsWith("la:") || data.startsWith("ln:")) {
    const id = data.slice(3);
    const approve = data.startsWith("la:");
    const { data: req } = await supabaseAdmin
      .from("login_requests")
      .select("id, account_id, status, expires_at")
      .eq("id", id)
      .maybeSingle();
    if (!req) return void sendMessage(chatId, "❌ So'rov topilmadi.");
    const { data: acc } = await supabaseAdmin
      .from("app_accounts")
      .select("user_id")
      .eq("id", req.account_id as string)
      .maybeSingle();
    if (!acc || acc.user_id !== u.userId)
      return void sendMessage(chatId, "🔒 Bu so'rov sizga tegishli emas.");
    if (req.status !== "pending") return void sendMessage(chatId, "ℹ️ Bu so'rov allaqachon yopilgan.");
    if (new Date(req.expires_at as string) < new Date()) {
      await supabaseAdmin.from("login_requests").update({ status: "expired" }).eq("id", id);
      return void sendMessage(chatId, "⌛ So'rov muddati tugagan. Saytda qaytadan urinib ko'ring.");
    }
    await supabaseAdmin
      .from("login_requests")
      .update({ status: approve ? "approved" : "denied" })
      .eq("id", id);
    return void sendMessage(
      chatId,
      approve
        ? "✅ Tasdiqlandi! Saytga qaytib qarang — avtomatik kirasiz."
        : "🚫 Rad etildi. Hisobingiz xavfsiz.",
    );
  }

  if (data === "words") return todaysWords(u);
  if (data === "quiz") return startQuiz(u);
  if (data === "progress") return progress(u);
  if (data === "vocab") return favorites(u);
  if (data === "assignments") return assignments(u);

  if (data === "settings") return settings(u);
  if (data === "story") return story(u);
  if (data === "weak") return weakSpots(u);
  if (data === "sentence") return sentenceTask(u);
  if (data === "students") return teacherOnly(u, () => students(u));
  if (data === "report") return teacherOnly(u, () => report(u));
  if (data === "invite") return teacherOnly(u, () => invite(u));
  if (data === "groups") return teacherOnly(u, () => teacherGroupsList(u));
  if (data === "top") return teacherOnly(u, () => teacherTop(u));
  if (data === "absent") return teacherOnly(u, () => teacherAbsent(u));
  if (data === "assign") return teacherOnly(u, () => teacherAssignStart(u));
  if (data === "materials") return teacherOnly(u, () => teacherMaterials(u));
  if (data === "curriculum") return teacherOnly(u, () => teacherCurriculum(u));

  if (data === "send")
    return teacherOnly(u, async () => {
      await setState(u.chatId, { mode: "send" });
      return void sendMessage(u.chatId, "📢 Yubormoqchi bo'lgan xabaringizni yozing:");
    });

  if (data.startsWith("hour:")) {
    const h = Number(data.split(":")[1]);
    await supabaseAdmin.from("profiles").update({ tg_daily_hour: h }).eq("user_id", u.userId);
    return void sendMessage(u.chatId, `✅ Kunlik so'zlar endi ${String(h).padStart(2, "0")}:00 da yuboriladi.`);
  }

  if (data.startsWith("rem:")) {
    const on = data.split(":")[1] === "1";
    await supabaseAdmin.from("profiles").update({ tg_reminders: on }).eq("user_id", u.userId);
    return void sendMessage(u.chatId, on ? "🔔 Eslatmalar yoqildi." : "🔕 Eslatmalar o'chirildi.");
  }

  if (data.startsWith("unfav:")) {
    const id = data.slice(6);
    await supabaseAdmin
      .from("vocab_words")
      .update({ is_favorite: false, favorited_at: null })
      .eq("id", id)
      .eq("user_id", u.userId);
    return favorites(u);
  }

  if (data.startsWith("done:")) {
    const id = data.slice(5);
    await supabaseAdmin
      .from("assignment_completions")
      .upsert({ assignment_id: id, student_id: u.userId }, { onConflict: "assignment_id,student_id" });
    await notifyTeacherOfCompletion(u, id);
    return assignments(u);
  }

  if (data.startsWith("qa:")) return quizAnswer(u, Number(data.slice(3)), cb.message!.message_id);
}

async function notifyTeacherOfCompletion(u: BotUser, assignmentId: string) {
  const { data: a } = await supabaseAdmin
    .from("assignments")
    .select("title, teacher_id")
    .eq("id", assignmentId)
    .maybeSingle();
  if (!a) return;
  const chat = await chatIdOfUser(a.teacher_id);
  if (chat) await sendMessage(chat, `✅ <b>${esc(u.name ?? "O'quvchi")}</b> "${esc(a.title)}" topshirig'ini bajardi.`);
}

async function quizAnswer(u: BotUser, choice: number, messageId: number) {
  const state = await getState(u.chatId);
  const quiz = state["quiz"] as { items: QuizItem[]; i: number; score: number } | undefined;
  if (!quiz) return void sendMessage(u.chatId, "Test tugagan. /quiz bilan yangisini boshlang.");

  const it = quiz.items[quiz.i]!;
  const correct = choice === it.answer;
  if (correct) {
    quiz.score++;
    await supabaseAdmin.from("learned_words").insert({ user_id: u.userId, word: it.word, translation: it.correct });
  } else {
    await supabaseAdmin.from("mistakes").insert({
      user_id: u.userId,
      question: `${it.word} — tarjimasi?`,
      correct_answer: it.correct,
      wrong_answer: it.choices[choice] ?? null,
      tag: "Lug'at",
      skill: "vocabulary",
    });
  }

  quiz.i++;
  if (quiz.i < quiz.items.length) {
    await setState(u.chatId, { quiz });
    await editMessage(
      u.chatId,
      messageId,
      correct ? `✅ To'g'ri! <b>${esc(it.word)}</b> — ${esc(it.correct)}` : `❌ Noto'g'ri. <b>${esc(it.word)}</b> — ${esc(it.correct)}`,
    );
    return sendQuizQuestion(u.chatId, quiz.items, quiz.i, quiz.score);
  }

  await clearState(u.chatId, ["quiz"]);
  await supabaseAdmin.from("daily_progress").upsert({ user_id: u.userId, day: today() }, { onConflict: "user_id,day" });
  const pct = Math.round((100 * quiz.score) / quiz.items.length);
  await editMessage(
    u.chatId,
    messageId,
    correct ? `✅ To'g'ri! <b>${esc(it.word)}</b> — ${esc(it.correct)}` : `❌ Noto'g'ri. <b>${esc(it.word)}</b> — ${esc(it.correct)}`,
  );
  await sendMessage(
    u.chatId,
    `🏁 <b>Test tugadi</b>\n\nNatija: ${quiz.score}/${quiz.items.length} (${pct}%)\n${pct >= 80 ? "🎉 Ajoyib!" : pct >= 50 ? "👍 Yaxshi, yana mashq qiling." : "💪 Takrorlash kerak."}`,
    { buttons: [[{ text: "🔁 Yana", callback_data: "quiz" }], [{ text: "📈 Progress", callback_data: "progress" }]] },
  );

  if (pct < 30) await alertTeacherLowScore(u, pct);
}

async function alertTeacherLowScore(u: BotUser, pct: number) {
  const { data: member } = await supabaseAdmin
    .from("group_members")
    .select("group_id")
    .eq("student_id", u.userId)
    .maybeSingle();
  if (!member) return;
  const { data: g } = await supabaseAdmin
    .from("groups")
    .select("teacher_id, name")
    .eq("id", member.group_id)
    .maybeSingle();
  if (!g) return;
  const chat = await chatIdOfUser(g.teacher_id);
  if (chat)
    await sendMessage(
      chat,
      `⚠️ <b>Past natija</b>\n${esc(u.name ?? "O'quvchi")} ("${esc(g.name)}") testda ${pct}% oldi. Yordam kerak bo'lishi mumkin.`,
    );
}
