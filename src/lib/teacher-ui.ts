/** Ustoz paneli uchun umumiy yordamchilar (A bo'limi). */

export const DAY_NAMES = ["Yak", "Du", "Se", "Chor", "Pay", "Jum", "Shan"];
export const DAY_FULL = [
  "Yakshanba",
  "Dushanba",
  "Seshanba",
  "Chorshanba",
  "Payshanba",
  "Juma",
  "Shanba",
];

export interface StudentRow {
  student_id: string;
  name: string;
  level_chosen: string | null;
  streak: number;
  best_streak: number;
  last_visit: string | null;
  learned_count: number;
  mistakes_count: number;
  accuracy: number;
  active_7: number;
  active_30: number;
  self_days_14: number;
  mistakes_7: number;
  mistakes_prev_7: number;
  assignments_total: number;
  assignments_done: number;
  joined_at: string;
}

export interface GroupOverview {
  group_id: string;
  name: string;
  join_code: string;
  lesson_days: number[];
  archived: boolean;
  students: number;
  active_today: number;
  active_7: number;
  avg_streak: number;
  avg_accuracy: number;
  at_risk: number;
}

export function daysSince(date: string | null): number | null {
  if (!date) return null;
  const d = new Date(date + "T00:00:00");
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00");
  return Math.round((today.getTime() - d.getTime()) / 86400000);
}

/** A5 + A8 — avtomatik ogohlantirish belgilari. */
export function alertsOf(s: StudentRow): string[] {
  const out: string[] = [];
  const gap = daysSince(s.last_visit);
  if (gap === null) out.push("Hech qachon kirmagan");
  else if (gap >= 3) out.push(`${gap} kundan beri yo'q`);
  if (s.streak === 0 && s.best_streak >= 3) out.push("Streak uzildi");
  if (s.mistakes_7 >= 5 && s.mistakes_7 > s.mistakes_prev_7 * 1.5) out.push("Xatolar keskin oshdi");
  if (s.assignments_total > 0 && s.assignments_done === 0) out.push("Topshiriq bajarilmagan");
  return out;
}

export function riskLevel(s: StudentRow): "ok" | "warn" | "danger" {
  const gap = daysSince(s.last_visit);
  if (gap === null || gap >= 7) return "danger";
  if (alertsOf(s).length > 0) return "warn";
  return "ok";
}

export function levelLabel(v: string | null): string {
  if (v === "past") return "Boshlang'ich";
  if (v === "orta") return "O'rta";
  if (v === "yaxshi") return "Yuqori";
  return "—";
}

/** A10 — Excel'da ochiladigan CSV hisobot. */
export function downloadCSV(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";"))
    .join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
