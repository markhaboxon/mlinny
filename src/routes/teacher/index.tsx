import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { createGroup, groupsOverview } from "@/lib/teacher.functions";
import { DAY_FULL, DAY_NAMES, type GroupOverview } from "@/lib/teacher-ui";
import { useAuthUser } from "@/hooks/useCloudSync";
import { useRequireRole } from "@/hooks/useRequireRole";

export const Route = createFileRoute("/teacher/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Ustoz paneli — Linny" },
      {
        name: "description",
        content: "Guruhlaringizni boshqaring: o'quvchilar statistikasi, topshiriqlar va taraqqiyot nazorati.",
      },
      { property: "og:title", content: "Ustoz paneli — Linny" },
      { property: "og:description", content: "Guruh, o'quvchi va taraqqiyot nazorati bir joyda." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TeacherHome,
});

function TeacherHome() {
  const user = useAuthUser();
  const guard = useRequireRole(["teacher"]);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const overview = useServerFn(groupsOverview);
  const create = useServerFn(createGroup);

  const [name, setName] = useState("");
  const [days, setDays] = useState<number[]>([]);
  const [showForm, setShowForm] = useState(false);

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ["groups-overview"],
    queryFn: () => overview() as Promise<GroupOverview[]>,
  });

  const addMut = useMutation({
    mutationFn: () => create({ data: { name, lessonDays: days } }),
    onSuccess: (g) => {
      setName("");
      setDays([]);
      setShowForm(false);
      toast.success(`Guruh yaratildi. Kod: ${g.join_code}`);
      qc.invalidateQueries({ queryKey: ["groups-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (guard.state !== "ok") {
    return (
      <Shell>
        <p className="text-sm text-muted-foreground">Yuklanmoqda...</p>
      </Shell>
    );
  }

  if (user === null) {
    return (
      <Shell>
        <div className="card-surface p-6 text-center">
          <p>Ustoz panelidan foydalanish uchun tizimga kiring.</p>
          <button className="btn-primary mt-4" onClick={() => navigate({ to: "/auth" })}>
            Kirish
          </button>
        </div>
      </Shell>
    );
  }

  const todayDow = new Date().getDay();
  const todayGroups = groups.filter((g) => g.lesson_days?.includes(todayDow));
  const otherGroups = groups.filter((g) => !g.lesson_days?.includes(todayDow));

  return (
    <Shell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Ustoz paneli</h1>
          <p className="text-sm text-muted-foreground">
            Bugun: {DAY_FULL[todayDow]} · {todayGroups.length} ta guruhda dars bor
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/" className="btn-ghost">
            Bosh sahifa
          </Link>
          <button className="btn-primary" onClick={() => setShowForm((v) => !v)}>
            + Yangi guruh
          </button>
        </div>
      </div>

      {showForm && (
        <div className="card-surface p-4">
          <h2 className="font-bold">Yangi guruh</h2>
          <input
            className="mt-3 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="Guruh nomi (masalan: Beginner A — 18:00)"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="mt-3">
            <div className="text-sm text-muted-foreground mb-1">Dars kunlari</div>
            <div className="flex flex-wrap gap-2">
              {DAY_NAMES.map((d, i) => (
                <button
                  key={d}
                  onClick={() =>
                    setDays((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]))
                  }
                  className={`rounded-full px-3 py-1 text-sm border ${
                    days.includes(i)
                      ? "gradient-brand border-transparent"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
          <button
            className="btn-primary mt-4 disabled:opacity-50"
            disabled={name.trim().length < 2 || addMut.isPending}
            onClick={() => addMut.mutate()}
          >
            {addMut.isPending ? "Yaratilmoqda..." : "Yaratish"}
          </button>
        </div>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">Yuklanmoqda...</p>}

      {!isLoading && groups.length === 0 && (
        <div className="card-surface p-6 text-center">
          <div className="text-4xl">👩‍🏫</div>
          <h2 className="mt-2 font-bold">Hali guruhingiz yo'q</h2>
          <p className="text-sm text-muted-foreground">
            "Yangi guruh" tugmasini bosing — tizim 6 xonali kod beradi, o'quvchilar shu kod bilan
            qo'shiladi.
          </p>
        </div>
      )}

      {todayGroups.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-bold">📌 Bugun darsi bor guruhlar</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {todayGroups.map((g) => (
              <GroupCard key={g.group_id} g={g} today />
            ))}
          </div>
        </section>
      )}

      {otherGroups.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-bold">Barcha guruhlar</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {otherGroups.map((g) => (
              <GroupCard key={g.group_id} g={g} />
            ))}
          </div>
        </section>
      )}

      {groups.length > 1 && (
        <section className="card-surface p-4">
          <h2 className="font-bold">Guruhlar taraqqiyotini solishtirish</h2>
          <div className="h-72 mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={groups.map((g) => ({
                  name: g.name.length > 12 ? g.name.slice(0, 12) + "…" : g.name,
                  "O'rtacha streak": Number(g.avg_streak),
                  "To'g'ri javob %": Number(g.avg_accuracy),
                  "7 kun faol": Number(g.active_7),
                }))}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="name" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Bar dataKey="O'rtacha streak" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="To'g'ri javob %" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="7 kun faol" fill="var(--chart-3)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}
    </Shell>
  );
}

function GroupCard({ g, today }: { g: GroupOverview; today?: boolean }) {
  return (
    <Link
      to="/teacher/$groupId"
      params={{ groupId: g.group_id }}
      className={`card-surface p-4 block hover:opacity-95 ${today ? "ring-2 ring-primary/40" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-bold">{g.name}</div>
          <div className="text-xs text-muted-foreground">
            Kod: <span className="font-mono font-semibold">{g.join_code}</span> ·{" "}
            {g.lesson_days?.length ? g.lesson_days.map((d) => DAY_NAMES[d]).join(", ") : "kunsiz"}
          </div>
        </div>
        {g.at_risk > 0 && (
          <span className="text-xs rounded-full bg-destructive/15 text-destructive px-2 py-1 whitespace-nowrap">
            {g.at_risk} ta e'tibor
          </span>
        )}
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2 text-center text-sm">
        <Mini label="O'quvchi" value={g.students} />
        <Mini label="Bugun" value={g.active_today} />
        <Mini label="Streak" value={g.avg_streak} />
        <Mini label="To'g'ri %" value={g.avg_accuracy} />
      </div>
    </Link>
  );
}

function Mini({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg bg-muted/50 py-2">
      <div className="font-bold">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-5">{children}</div>
    </div>
  );
}
