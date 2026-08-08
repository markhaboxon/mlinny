import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { weeklyReport } from "@/lib/teacher.functions";
import { alertsOf, downloadCSV, levelLabel, type StudentRow } from "@/lib/teacher-ui";

interface Weekly {
  students: number;
  active_students: number;
  total_active_days: number;
  new_mistakes: number;
  learned_words: number;
  assignments_done: number;
  assignments_total: number;
  best_student: string | null;
  weakest_topic: string | null;
}

/** A10 + A18 — haftalik avtomatik xulosa va hisobotni yuklab olish. */
export default function ReportTab({
  groupId,
  groupName,
  students,
}: {
  groupId: string;
  groupName: string;
  students: StudentRow[];
}) {
  const report = useServerFn(weeklyReport);
  const { data } = useQuery({
    queryKey: ["weekly", groupId],
    queryFn: () => report({ data: { groupId } }) as Promise<Weekly | null>,
  });

  function exportCSV() {
    const rows: (string | number)[][] = [
      [`${groupName} — hisobot`, new Date().toLocaleDateString("uz-UZ")],
      [],
      [
        "Ism",
        "Daraja",
        "Streak",
        "Eng yaxshi streak",
        "Oxirgi kirish",
        "To'g'ri javob %",
        "O'rganilgan so'z",
        "Xatolar",
        "7 kunlik faollik",
        "Mustaqil kunlar (14)",
        "Topshiriq bajardi",
        "Topshiriq jami",
        "Ogohlantirish",
      ],
      ...students.map((s) => [
        s.name,
        levelLabel(s.level_chosen),
        s.streak,
        s.best_streak,
        s.last_visit ?? "—",
        s.accuracy,
        s.learned_count,
        s.mistakes_count,
        s.active_7,
        s.self_days_14,
        s.assignments_done,
        s.assignments_total,
        alertsOf(s).join(", ") || "—",
      ]),
    ];
    downloadCSV(`${groupName.replace(/\s+/g, "_")}_hisobot.csv`, rows);
  }

  return (
    <div className="space-y-4">
      <div className="card-surface p-4 print:shadow-none">
        <h3 className="font-bold">Haftalik avtomatik xulosa</h3>
        {!data ? (
          <p className="mt-2 text-sm text-muted-foreground">Yuklanmoqda...</p>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Stat label="Faol o'quvchi" value={`${data.active_students}/${data.students}`} />
            <Stat label="Jami faol kunlar" value={data.total_active_days} />
            <Stat label="Yangi xatolar" value={data.new_mistakes} />
            <Stat label="O'rganilgan so'z" value={data.learned_words} />
            <Stat
              label="Topshiriq bajarilishi"
              value={`${data.assignments_done}/${data.assignments_total}`}
            />
            <Stat label="Haftaning eng faoli" value={data.best_student ?? "—"} />
            <Stat label="Eng qiyin mavzu" value={data.weakest_topic ?? "—"} />
          </div>
        )}
      </div>

      <div className="card-surface p-4 print:hidden">
        <h3 className="font-bold">Hisobotni chiqarish</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Excel uchun CSV fayl yoki PDF (chop etish oynasida "Save as PDF" ni tanlang).
        </p>
        <div className="mt-3 flex gap-2">
          <button className="btn-primary" onClick={exportCSV}>
            Excel (CSV) yuklab olish
          </button>
          <button className="btn-ghost" onClick={() => window.print()}>
            PDF / chop etish
          </button>
        </div>
      </div>

      <div className="card-surface p-4">
        <h3 className="font-bold mb-2">To'liq jadval (hisobot uchun)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th className="text-left px-2 py-1">Ism</th>
                <th className="text-left px-2 py-1">Daraja</th>
                <th className="text-left px-2 py-1">Streak</th>
                <th className="text-left px-2 py-1">To'g'ri %</th>
                <th className="text-left px-2 py-1">Xato</th>
                <th className="text-left px-2 py-1">Topshiriq</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.student_id} className="border-t border-border">
                  <td className="px-2 py-1">{s.name}</td>
                  <td className="px-2 py-1">{levelLabel(s.level_chosen)}</td>
                  <td className="px-2 py-1">{s.streak}</td>
                  <td className="px-2 py-1">{s.accuracy}%</td>
                  <td className="px-2 py-1">{s.mistakes_count}</td>
                  <td className="px-2 py-1">
                    {s.assignments_done}/{s.assignments_total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-bold">{value}</div>
    </div>
  );
}
