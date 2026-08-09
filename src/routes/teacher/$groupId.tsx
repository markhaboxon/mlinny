import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Area,
  AreaChart,
  Cell,
  CartesianGrid,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  groupActivity,
  groupStudents,
  groupSummary,
  groupTopMistakes,
  groupsOverview,
  removeStudent,
  updateGroup,
  deleteGroup,
} from "@/lib/teacher.functions";
import { DAY_NAMES, levelLabel, riskLevel, type GroupOverview, type StudentRow } from "@/lib/teacher-ui";
import StudentsTable from "@/components/teacher/StudentsTable";
import AssignmentsTab from "@/components/teacher/AssignmentsTab";
import CurriculumTab from "@/components/teacher/CurriculumTab";
import MaterialsTab from "@/components/teacher/MaterialsTab";
import ReportTab from "@/components/teacher/ReportTab";
import { useAuthUser } from "@/hooks/useCloudSync";
import { useRequireRole } from "@/hooks/useRequireRole";

export const Route = createFileRoute("/teacher/$groupId")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Guruh boshqaruvi — Linny" },
      { name: "description", content: "Guruh statistikasi, o'quvchilar nazorati va topshiriqlar." },
      { property: "og:title", content: "Guruh boshqaruvi — Linny" },
      { property: "og:description", content: "O'quvchilar taraqqiyoti va topshiriqlar bir joyda." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GroupPage,
});

type Tab = "xulosa" | "oquvchilar" | "topshiriq" | "dastur" | "material" | "hisobot";

interface Summary {
  total_students: number;
  active_today: number;
  active_7: number;
  avg_streak: number;
  avg_accuracy: number;
  top_mistake_tag: string | null;
  at_risk: number;
}

const PIE_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"];

function GroupPage() {
  const { groupId } = Route.useParams();
  const user = useAuthUser();
  const guard = useRequireRole(["teacher"]);
  const isTeacher = guard.state === "ok";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("xulosa");
  const [range, setRange] = useState(7);

  const fetchOverview = useServerFn(groupsOverview);
  const fetchStudents = useServerFn(groupStudents);
  const fetchSummary = useServerFn(groupSummary);
  const fetchTop = useServerFn(groupTopMistakes);
  const fetchActivity = useServerFn(groupActivity);
  const kick = useServerFn(removeStudent);
  const patch = useServerFn(updateGroup);
  const destroy = useServerFn(deleteGroup);

  const { data: groups = [] } = useQuery({
    queryKey: ["groups-overview"],
    queryFn: () => fetchOverview() as Promise<GroupOverview[]>,
   enabled: isTeacher,
    retry: false,
  });
  const group = groups.find((g) => g.group_id === groupId);

  const { data: students = [], isLoading } = useQuery({
    queryKey: ["students", groupId],
    queryFn: () => fetchStudents({ data: { groupId } }) as Promise<StudentRow[]>,
   enabled: isTeacher,
    retry: false,
  });
  const { data: summary } = useQuery({
    queryKey: ["summary", groupId],
    queryFn: () => fetchSummary({ data: { groupId } }) as Promise<Summary | null>,
   enabled: isTeacher,
    retry: false,
  });
  const { data: topMistakes = [] } = useQuery({
    queryKey: ["top-mistakes", groupId],
    queryFn: () => fetchTop({ data: { groupId } }) as Promise<{ tag: string; cnt: number }[]>,
   enabled: isTeacher,
    retry: false,
  });
  const { data: activity = [] } = useQuery({
    queryKey: ["activity", groupId, range],
    queryFn: () =>
      fetchActivity({ data: { groupId, days: range } }) as Promise<
        { day: string; active: number; mistakes: number }[]
      >,
   enabled: isTeacher,
    retry: false,
  });

  const kickMut = useMutation({
    mutationFn: (studentId: string) => kick({ data: { groupId, studentId } }),
    onSuccess: () => {
      toast.success("O'quvchi guruhdan chiqarildi");
      qc.invalidateQueries({ queryKey: ["students", groupId] });
      qc.invalidateQueries({ queryKey: ["groups-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const daysMut = useMutation({
    mutationFn: (lessonDays: number[]) => patch({ data: { groupId, lessonDays } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["groups-overview"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: () => destroy({ data: { groupId } }),
    onSuccess: () => {
      toast.success("Guruh o'chirildi");
      qc.invalidateQueries({ queryKey: ["groups-overview"] });
      navigate({ to: "/teacher" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (guard.state !== "ok") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <p className="text-sm text-muted-foreground">Yuklanmoqda...</p>
      </div>
    );
  }

  if (user === null) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card-surface p-6 text-center">
          <p>Tizimga kiring.</p>
          <button className="btn-primary mt-4" onClick={() => navigate({ to: "/auth" })}>
            Kirish
          </button>
        </div>
      </div>
    );
  }

  const levelData = ["past", "orta", "yaxshi", null].map((lv) => ({
    name: levelLabel(lv),
    value: students.filter((s) => (s.level_chosen ?? null) === lv).length,
  })).filter((d) => d.value > 0);

  const risky = students.filter((s) => riskLevel(s) !== "ok");

  return (
    <div className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link to="/teacher" className="text-sm text-muted-foreground hover:underline">
              ← Barcha guruhlar
            </Link>
            <h1 className="text-2xl font-bold">{group?.name ?? "Guruh"}</h1>
            <p className="text-sm text-muted-foreground">
              Qo'shilish kodi:{" "}
              <span className="font-mono font-bold text-foreground">{group?.join_code ?? "..."}</span>
            </p>
          </div>
          <button
            className="btn-ghost text-destructive"
            onClick={() => {
              if (confirm("Guruh va uning barcha topshiriqlari o'chiriladi. Davom etamizmi?"))
                delMut.mutate();
            }}
          >
            Guruhni o'chirish
          </button>
        </div>

        {/* A14 — dars oldidan 3-4 qatorlik tayyor xulosa */}
        {summary && (
          <div className="card-surface p-4 border-l-4 border-l-primary">
            <h2 className="font-bold">Darsga tayyorgarlik xulosasi</h2>
            <ul className="mt-2 space-y-1 text-sm">
              <li>
                • Guruhda {summary.total_students} o'quvchi, bugun {summary.active_today} tasi faol
                bo'lgan, oxirgi 7 kunda {summary.active_7} tasi mashq qilgan.
              </li>
              <li>
                • O'rtacha streak {summary.avg_streak} kun, o'rtacha to'g'ri javob{" "}
                {summary.avg_accuracy}%.
              </li>
              <li>
                • Guruhning eng ko'p xato mavzusi:{" "}
                <b>{summary.top_mistake_tag ?? "hozircha aniqlanmadi"}</b> — darsda shunga urg'u
                bering.
              </li>
              <li>
                • {summary.at_risk > 0
                  ? `${summary.at_risk} ta o'quvchi 3 kundan beri kirmagan — "uyg'otish" ro'yxatiga qarang.`
                  : "Hamma o'quvchi faol, uzilgan o'quvchi yo'q."}
              </li>
            </ul>
          </div>
        )}

        {/* A5 + A8 — uyg'otish signali */}
        {risky.length > 0 && (
          <div className="card-surface p-4 bg-destructive/5">
            <h2 className="font-bold text-destructive">🔔 Uyg'otish kerak ({risky.length})</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {risky.map((s) => (
                <Link
                  key={s.student_id}
                  to="/teacher/student/$studentId"
                  params={{ studentId: s.student_id }}
                  className="rounded-full border border-destructive/40 px-3 py-1 text-sm hover:bg-destructive/10"
                >
                  {s.name} · {s.last_visit ?? "hech qachon"}
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {(
            [
              ["xulosa", "Xulosa"],
              ["oquvchilar", "O'quvchilar"],
              ["topshiriq", "Topshiriqlar"],
              ["dastur", "Dars dasturi"],
              ["material", "Materiallar"],
              ["hisobot", "Hisobot"],
            ] as [Tab, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`rounded-full px-4 py-2 text-sm border ${
                tab === key ? "gradient-brand border-transparent" : "border-border text-muted-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {isLoading && <p className="text-sm text-muted-foreground">Yuklanmoqda...</p>}

        {tab === "xulosa" && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="card-surface p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold">Faollik grafigi</h3>
                  <div className="flex gap-1">
                    {[7, 30].map((d) => (
                      <button
                        key={d}
                        onClick={() => setRange(d)}
                        className={`rounded-full px-3 py-1 text-xs border ${
                          range === d ? "gradient-brand border-transparent" : "border-border"
                        }`}
                      >
                        {d} kun
                      </button>
                    ))}
                  </div>
                </div>
                <div className="h-56 mt-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={activity.map((a) => ({ ...a, day: a.day.slice(5) }))}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="day" fontSize={11} />
                      <YAxis fontSize={11} allowDecimals={false} />
                      <Tooltip />
                      <Legend />
                      <Area
                        type="monotone"
                        name="Faol o'quvchi"
                        dataKey="active"
                        stroke="var(--chart-2)"
                        fill="var(--chart-2)"
                        fillOpacity={0.25}
                      />
                      <Area
                        type="monotone"
                        name="Xatolar"
                        dataKey="mistakes"
                        stroke="var(--chart-5)"
                        fill="var(--chart-5)"
                        fillOpacity={0.15}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="card-surface p-4">
                <h3 className="font-bold">Daraja taqsimoti</h3>
                <div className="h-56 mt-3">
                  {levelData.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Ma'lumot yo'q.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={levelData} dataKey="value" nameKey="name" outerRadius={80} label>
                          {levelData.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div>

            <div className="card-surface p-4">
              <h3 className="font-bold">Guruhda eng ko'p qilinayotgan xatolar</h3>
              {topMistakes.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">Hali xatolar yozilmagan.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {topMistakes.map((m) => {
                    const max = Math.max(...topMistakes.map((x) => Number(x.cnt)));
                    return (
                      <li key={m.tag}>
                        <div className="flex justify-between text-sm">
                          <span>{m.tag}</span>
                          <span className="text-muted-foreground">{m.cnt} ta</span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full gradient-brand"
                            style={{ width: `${(Number(m.cnt) / max) * 100}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="card-surface p-4">
              <h3 className="font-bold">Dars kunlari</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {DAY_NAMES.map((d, i) => {
                  const on = group?.lesson_days?.includes(i);
                  return (
                    <button
                      key={d}
                      onClick={() => {
                        const cur = group?.lesson_days ?? [];
                        daysMut.mutate(on ? cur.filter((x) => x !== i) : [...cur, i]);
                      }}
                      className={`rounded-full px-3 py-1 text-sm border ${
                        on ? "gradient-brand border-transparent" : "border-border text-muted-foreground"
                      }`}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Dars kunlari "Bugungi kun" bosh sahifasi va mustaqil faollik hisobi uchun ishlatiladi.
              </p>
            </div>
          </div>
        )}

        {tab === "oquvchilar" && (
          <StudentsTable
            students={students}
            onRemove={(id, name) => {
              if (confirm(`${name} guruhdan chiqarilsinmi?`)) kickMut.mutate(id);
            }}
          />
        )}

        {tab === "topshiriq" && <AssignmentsTab groupId={groupId} students={students} />}
        {tab === "dastur" && <CurriculumTab groupId={groupId} />}
        {tab === "material" && <MaterialsTab groupId={groupId} groups={groups} />}
        {tab === "hisobot" && (
          <ReportTab groupId={groupId} groupName={group?.name ?? "Guruh"} students={students} />
        )}
      </div>
    </div>
  );
}
