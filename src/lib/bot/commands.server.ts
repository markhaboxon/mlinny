// Role-aware "/" command menus. Every chat gets exactly the commands its role
// can actually run, so students never see teacher commands and vice versa.
import { setCommands, type BotCommand } from "@/lib/telegram.server";
import type { BotUser } from "./core.server";

export const GUEST_COMMANDS: BotCommand[] = [
  { command: "start", description: "Boshlash / hisobni ulash" },
  { command: "help", description: "Yordam" },
];

export const STUDENT_COMMANDS: BotCommand[] = [
  { command: "menu", description: "Asosiy menyu" },
  { command: "words", description: "Bugungi so'zlar" },
  { command: "quiz", description: "Tezkor viktorina" },
  { command: "progress", description: "Progress: daraja, streak" },
  { command: "vocab", description: "Sevimli so'zlar" },
  { command: "assignments", description: "Topshiriqlar" },
  { command: "sentence", description: "Gap tuzish mashqi" },
  { command: "story", description: "So'zlardan mini-hikoya" },
  { command: "weak", description: "Zaif joylar tahlili" },
  { command: "ask", description: "AI'dan savol so'rash" },
  { command: "profile", description: "Mening hisobim" },
  { command: "settings", description: "Sozlamalar" },
  { command: "help", description: "Buyruqlar ro'yxati" },
  { command: "unlink", description: "Telegramni hisobdan uzish" },
];

export const TEACHER_COMMANDS: BotCommand[] = [
  { command: "menu", description: "Asosiy menyu" },
  { command: "students", description: "O'quvchilar va bugungi holat" },
  { command: "report", description: "Haftalik hisobot" },
  { command: "send", description: "Guruhlarga xabar yuborish" },
  { command: "schedule", description: "Xabarni rejalashtirish" },
  { command: "invite", description: "Taklif havolasi" },
  { command: "ask", description: "AI'dan savol so'rash" },
  { command: "profile", description: "Mening hisobim" },
  { command: "help", description: "Buyruqlar ro'yxati" },
  { command: "unlink", description: "Telegramni hisobdan uzish" },
];

export const ADMIN_COMMANDS: BotCommand[] = [
  ...TEACHER_COMMANDS,
  { command: "stats", description: "Tizim statistikasi" },
];

export function commandsFor(kind: BotUser["kind"]): BotCommand[] {
  if (kind === "admin") return ADMIN_COMMANDS;
  if (kind === "teacher") return TEACHER_COMMANDS;
  return STUDENT_COMMANDS;
}

/** Best-effort: never let a menu sync failure break the actual reply. */
export async function syncChatCommands(u: BotUser) {
  try {
    await setCommands(commandsFor(u.kind), u.chatId);
  } catch {
    /* ignore */
  }
}
