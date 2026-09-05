// Har bir rol uchun buyruqlar ro'yxati — Telegram menyusi rolga qarab
// sozlanadi, boshqa rolning buyruqlari umuman ko'rinmaydi.
import { setChatCommands } from "@/lib/telegram.server";
import type { BotUser } from "./core.server";

export const STUDENT_COMMANDS = [
  { command: "menu", description: "Asosiy menyu" },
  { command: "words", description: "Bugungi so'zlar" },
  { command: "quiz", description: "Tezkor viktorina" },
  { command: "progress", description: "Progress va streak" },
  { command: "vocab", description: "Sevimli so'zlar" },
  { command: "assignments", description: "Topshiriqlar" },
  { command: "sentence", description: "Gap tuzish mashqi" },
  { command: "story", description: "Mini-hikoya" },
  { command: "weak", description: "Zaif joylar tahlili" },
  { command: "ielts", description: "IELTS natijalarim va mashq" },
  { command: "league", description: "Haftalik liga reytingi" },
  { command: "shop", description: "Tangalar va do'kon" },
  { command: "duel", description: "Do'st bilan duel" },
  { command: "review", description: "Aqlli takrorlash (SRS)" },
  { command: "pronounce", description: "Talaffuz mashqi" },
  { command: "ask", description: "AI'dan savol so'rash" },
  { command: "settings", description: "Sozlamalar" },
  { command: "profile", description: "Mening hisobim" },
  { command: "help", description: "Yordam" },
];

export const TEACHER_COMMANDS = [
  { command: "menu", description: "Ustoz menyusi" },
  { command: "students", description: "O'quvchilar va bugungi holat" },
  { command: "groups", description: "Guruhlarim" },
  { command: "student", description: "O'quvchi haqida (ism yozing)" },
  { command: "top", description: "Eng faol o'quvchilar" },
  { command: "absent", description: "Bugun mashq qilmaganlar" },
  { command: "assign", description: "Yangi topshiriq berish" },
  { command: "materials", description: "Dars materiallari" },
  { command: "curriculum", description: "Dars rejasi" },
  { command: "report", description: "Haftalik AI hisobot" },
  { command: "send", description: "Guruhlarga xabar" },
  { command: "schedule", description: "Xabarni rejalashtirish" },
  { command: "invite", description: "Guruh qo'shilish kodlari" },
  { command: "ask", description: "AI'dan savol" },
  { command: "profile", description: "Mening hisobim" },
  { command: "help", description: "Yordam" },
];

export const ADMIN_COMMANDS = [
  ...TEACHER_COMMANDS,
  { command: "stats", description: "Tizim statistikasi" },
];

export function commandsFor(kind: BotUser["kind"]) {
  if (kind === "admin") return ADMIN_COMMANDS;
  if (kind === "teacher") return TEACHER_COMMANDS;
  return STUDENT_COMMANDS;
}

const STUDENT_ONLY = new Set([
  "/words",
  "/quiz",
  "/progress",
  "/vocab",
  "/assignments",
  "/sentence",
  "/story",
  "/weak",
  "/ielts",
  "/league",
  "/shop",
  "/duel",
  "/settings",
]);
const TEACHER_ONLY = new Set([
  "/students",
  "/groups",
  "/student",
  "/top",
  "/absent",
  "/assign",
  "/materials",
  "/curriculum",
  "/report",
  "/send",
  "/schedule",
  "/invite",
]);

/** Buyruq shu rolga tegishlimi? */
export function allowed(kind: BotUser["kind"], cmd: string): boolean {
  const teacherish = kind === "teacher" || kind === "admin";
  if (cmd === "/stats") return kind === "admin";
  if (TEACHER_ONLY.has(cmd)) return teacherish;
  if (STUDENT_ONLY.has(cmd)) return !teacherish;
  return true;
}

export async function syncRoleCommands(u: BotUser) {
  await setChatCommands(u.chatId, commandsFor(u.kind));
}
