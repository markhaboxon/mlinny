import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { alertsOf, daysSince, levelLabel, riskLevel, type StudentRow } from "@/lib/teacher-ui";

type SortKey = "name" | "streak" | "last_visit" | "accuracy" | "active_7" | "self_days_14";

interface Props {
  students: StudentRow[];
  onRemove: (id: string, name: string) => void;
}

/** A3 + A4 + A5 + A8 + A17 — saralanadigan o'quvchilar jadvali. */
export default function StudentsTable({ students, onRemove }: Props) {
  const [sort, setSort] = useState<SortKey>("name");
  const [asc, setAsc] = useState(true);
  const [onlyRisk, setOnlyRisk] = useState(false);

  const rows = students
    .filter((s) => (onlyRisk ? riskLevel(s) !== "ok" : true))
    .slice()
    .sort((a, b) => {
      let r = 0;
      if (sort === "name") r = a.name.localeCompare(b.name);
      else if (sort === "last_visit") r = (a.last_visit ?? "").localeCompare(b.last_visit ?? "");
      else r = Number(a[sort]) - Number(b[sort]);
      return asc ? r : -r;
    });

  function head(key: SortKey, label: string) {
    const active = sort === key;
    return (
      <th
        onClick={() => {
          if (active) setAsc(!asc);
          else {
            setSort(key);
            setAsc(key === "name");
          }
        }}
        className={`px-3 py-2 text-left font-semibold cursor-pointer select-none whitespace-nowrap ${active ? "text-primary" : ""}`}
      >
        {label} {active ? (asc ? "▲" : "▼") : ""}
      </th>
    );
  }

  return (
    <div className="card-surface overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 p-4 border-b border-border">
        <h3 className="font-bold">O'quvchilar ({students.length})</h3>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyRisk} onChange={(e) => setOnlyRisk(e.target.checked)} />
          Faqat e'tibor talab qiladiganlar
        </label>
      </div>

      {students.length === 0 ? (
        <p className="p-6 text-sm text-muted-foreground">
          Hali o'quvchi yo'q. Guruh kodini o'quvchilarga bering.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                {head("name", "Ism")}
                {head("streak", "Streak")}
                {head("last_visit", "Oxirgi kirish")}
                {head("accuracy", "To'g'ri javob %")}
                {head("active_7", "7 kun faollik")}
                {head("self_days_14", "Mustaqil (14 kun)")}
                <th className="px-3 py-2 text-left font-semibold">Topshiriq</th>
                <th className="px-3 py-2 text-left font-semibold">Holat</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const risk = riskLevel(s);
                const gap = daysSince(s.last_visit);
                const tone =
                  risk === "danger"
                    ? "bg-destructive/10"
                    : risk === "warn"
                      ? "bg-amber-500/10"
                      : "";
                return (
                  <tr key={s.student_id} className={`border-t border-border ${tone}`}>
                    <td className="px-3 py-2">
                      <Link
                        to="/teacher/student/$studentId"
                        params={{ studentId: s.student_id }}
                        className="font-semibold text-primary hover:underline"
                      >
                        {s.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">{levelLabel(s.level_chosen)}</div>
                    </td>
                    <td className="px-3 py-2">🔥 {s.streak}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {s.last_visit ?? "—"}
                      {gap !== null && gap > 0 && (
                        <span className="text-xs text-muted-foreground"> ({gap} kun)</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{s.accuracy}%</td>
                    <td className="px-3 py-2">{s.active_7}/7</td>
                    <td className="px-3 py-2">{s.self_days_14}</td>
                    <td className="px-3 py-2">
                      {s.assignments_done}/{s.assignments_total}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {alertsOf(s).length === 0 ? (
                          <span className="text-xs rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 px-2 py-0.5">
                            Yaxshi
                          </span>
                        ) : (
                          alertsOf(s).map((a) => (
                            <span
                              key={a}
                              className="text-xs rounded-full bg-destructive/15 text-destructive px-2 py-0.5"
                            >
                              {a}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => onRemove(s.student_id, s.name)}
                        className="text-xs text-muted-foreground hover:text-destructive"
                      >
                        Chiqarish
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
