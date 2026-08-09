import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getLeagueBoard } from "@/lib/game.functions";
import { useRequireRole } from "@/hooks/useRequireRole";

export const Route = createFileRoute("/league")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Liga — Linny" },
      { name: "description", content: "Haftalik XP reytingi: bronzadan olmos ligagacha ko'tariling." },
      { property: "og:title", content: "Liga — Linny" },
      { property: "og:description", content: "Haftalik XP reytingi va liga tarixi." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LeaguePage,
});

const LEAGUES: Record<string, string> = {
  bronze: "🥉 Bronza",
  silver: "🥈 Kumush",
  gold: "🥇 Oltin",
  diamond: "💎 Olmos",
};

const RESULT: Record<string, string> = {
  up: "⬆️ Ko'tarildi",
  down: "⬇️ Tushdi",
  stay: "➡️ Qoldi",
};

function LeaguePage() {
  const { state } = useRequireRole(["student", "user", "teacher", "admin"]);
  const ready = state === "ok";
  const load = useServerFn(getLeagueBoard);
  const { data, isLoading } = useQuery({
    queryKey: ["league-board"],
    queryFn: () => load(),
    enabled: ready,
    retry: false,
  });

  if (!ready) return <div className="p-8 text-center text-muted-foreground">Yuklanmoqda...</div>;

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-2xl mx-auto">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">🏆 Liga</h1>
        <Link to="/" className="btn-ghost text-sm">
          ← Panel
        </Link>
      </header>

      <div className="mt-3 card-surface p-4">
        <div className="text-lg font-bold">{LEAGUES[data?.league ?? "bronze"]}</div>
        <p className="text-sm text-muted-foreground mt-1">
          Bu hafta: <span className="font-semibold">{data?.myXp ?? 0} XP</span>. Hafta oxirida yuqori
          o'rinlar keyingi ligaga ko'tariladi.
        </p>
      </div>

      {isLoading && <p className="mt-6 text-center text-muted-foreground">Yuklanmoqda...</p>}

      <div className="mt-4 card-surface divide-y divide-border">
        {(data?.board ?? []).map((r) => (
          <div
            key={`${r.rank}-${r.name}`}
            className={`flex items-center gap-3 p-3 ${r.isMe ? "bg-primary/5" : ""}`}
          >
            <div className="w-7 text-center text-sm font-bold text-muted-foreground">{r.rank}</div>
            <div className="text-xl">{r.avatar}</div>
            <div className="flex-1 text-sm font-medium">
              {r.name} {r.isMe && <span className="text-xs text-primary">(siz)</span>}
            </div>
            <div className="text-sm font-semibold">{r.xp} XP</div>
          </div>
        ))}
        {!isLoading && (data?.board ?? []).length === 0 && (
          <div className="p-4 text-sm text-muted-foreground text-center">Hozircha reyting bo'sh.</div>
        )}
      </div>

      {(data?.history ?? []).length > 0 && (
        <div className="mt-6">
          <div className="text-xs uppercase text-muted-foreground">O'tgan haftalar</div>
          <div className="mt-2 card-surface divide-y divide-border">
            {(data?.history ?? []).map((h) => (
              <div key={h.weekStart} className="flex items-center justify-between p-3 text-sm">
                <span>{h.weekStart}</span>
                <span>{LEAGUES[h.league]}</span>
                <span className="text-muted-foreground">{h.xp} XP</span>
                <span>{RESULT[h.result] ?? h.result}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
