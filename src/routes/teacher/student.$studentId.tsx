import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { studentActivity, studentMistakes } from "@/lib/teacher.functions";
import { useAuthUser } from "@/hooks/useCloudSync";
import { useRequireRole } from "@/hooks/useRequireRole";

export const Route = createFileRoute("/teacher/student/$studentId")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "O'quvchi profili — Linny" },
      { name: "description", content: "O'quvchining xatolar tarixi va taraqqiyot statistikasi." },
      { property: "og:title", content: "O'quvchi profili — Linny" },
      { property: "og:description", content: "Xatolar tarixi va kunlik taraqqiyot grafigi." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StudentPage,
});

interface MistakeRow {
  question: string;
  wrong_answer: string | null;
  correct_answer: string;
  explanation: string | null;
  tag: string | null;
  skill: string | null;
  created_at: string;
}

function StudentPage() {
  const { studentId } = Route.useParams();
  const user = useAuthUser();
  const guard = useRequireRole(["teacher"]);
  const navigate = useNavigate();
  const router = useRouter();
  const [range, setRange] = useState(30);

  const act = useServerFn(studentActivity);
  const mis = useServerFn(studentMistakes);

  const { data: activity = [] } = useQuery({
    queryKey: ["student-activity", studentId, range],
    queryFn: () =>
      act({ data: { studentId, days: range } }) as Promise<
        { day: string; active: number; mistakes: number; learned: number }[]
      >,
  });
  const { data: mistakes = [], error } = useQuery({
    queryKey: ["student-mistakes", studentId],
    queryFn: () => mis({ data: { studentId } }) as Promise<MistakeRow[]>,
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
        <button className="btn-primary" onClick={() => navigate({ to: "/auth" })}>
          Kirish
        </button>
      </div>
    );
  }

  const byTag = mistakes.reduce<Record<string, number>>((acc, m) => {
    const t = m.tag ?? "Boshqa";
    acc[t] = (acc[t] ?? 0) + 1;
    return acc;
  }, {});
  const topTags = Object.entries(byTag).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-5xl space-y-5">
        <button onClick={() => router.history.back()} className="text-sm text-muted-foreground hover:underline">
          ← Orqaga
        </button>
        <h1 className="text-2xl font-bold">O'quvchi profili</h1>

        {error && (
          <div className="card-surface p-4 text-sm text-destructive">
            Bu o'quvchi ma'lumotlarini ko'rish huquqingiz yo'q.
          </div>
        )}

        <div className="card-surface p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">Taraqqiyot grafigi</h2>
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
          <div className="h-64 mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={activity.map((a) => ({ ...a, day: a.day.slice(5) }))}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="day" fontSize={11} />
                <YAxis fontSize={11} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Area type="monotone" name="Faol kun" dataKey="active" stroke="var(--chart-2)" fill="var(--chart-2)" fillOpacity={0.2} />
                <Area type="monotone" name="O'rgangan so'z" dataKey="learned" stroke="var(--chart-1)" fill="var(--chart-1)" fillOpacity={0.2} />
                <Area type="monotone" name="Xatolar" dataKey="mistakes" stroke="var(--chart-5)" fill="var(--chart-5)" fillOpacity={0.15} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {topTags.length > 0 && (
          <div className="card-surface p-4">
            <h2 className="font-bold">Eng ko'p xato mavzular</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {topTags.map(([t, c]) => (
                <span key={t} className="rounded-full bg-muted px-3 py-1 text-sm">
                  {t} · {c}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="card-surface p-4">
          <h2 className="font-bold">Xatolar tarixi ({mistakes.length})</h2>
          {mistakes.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Xatolar yo'q.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {mistakes.map((m, i) => (
                <li key={i} className="rounded-lg border border-border p-3">
                  <div className="text-sm font-medium">{m.question}</div>
                  <div className="mt-1 text-sm">
                    <span className="text-destructive">✗ {m.wrong_answer ?? "—"}</span>{" "}
                    <span className="text-emerald-600">✓ {m.correct_answer}</span>
                  </div>
                  {m.explanation && (
                    <p className="mt-1 text-xs text-muted-foreground">{m.explanation}</p>
                  )}
                  <div className="mt-1 text-xs text-muted-foreground">
                    {m.tag ?? "Boshqa"} · {m.skill ?? "—"} · {m.created_at.slice(0, 10)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
