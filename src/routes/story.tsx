import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listScenarios, replyStory, startStory, type StoryTurn } from "@/lib/story.functions";
import { useRequireRole } from "@/hooks/useRequireRole";
import { loadProfile } from "@/lib/profile";

export const Route = createFileRoute("/story")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Hikoya darslari — Linny" },
      {
        name: "description",
        content: "Aeroport, ish suhbati, shifokor — real vaziyatlarda AI bilan inglizcha suhbat.",
      },
      { property: "og:title", content: "Hikoya darslari — Linny" },
      { property: "og:description", content: "Real vaziyatlarda inglizcha rolli suhbat mashqi." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StoryPage,
});

function StoryPage() {
  const { state } = useRequireRole(["student", "user", "teacher", "admin"]);
  const ready = state === "ok";
  const list = useServerFn(listScenarios);
  const start = useServerFn(startStory);
  const reply = useServerFn(replyStory);
  const qc = useQueryClient();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [turns, setTurns] = useState<StoryTurn[]>([]);
  const [finished, setFinished] = useState(false);
  const [reward, setReward] = useState<{ xp: number; coins: number } | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const { data: scenarios, isLoading } = useQuery({
    queryKey: ["story-scenarios"],
    queryFn: () => list(),
    enabled: ready,
    retry: false,
  });

  const age = loadProfile().age ?? 18;

  async function begin(code: string) {
    setBusy(true);
    setErr(null);
    try {
      const res = await start({ data: { code, age } });
      setSessionId(res.sessionId);
      setTitle(res.title);
      setTurns(res.turns);
      setFinished(false);
      setReward(null);
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  }

  async function send(message: string) {
    if (!sessionId || !message.trim()) return;
    setBusy(true);
    setErr(null);
    setText("");
    try {
      const res = await reply({ data: { sessionId, message: message.trim(), age } });
      setTurns(res.turns);
      setFinished(res.finished);
      setReward(res.reward);
      if (res.finished) qc.invalidateQueries({ queryKey: ["game-state"] });
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  }

  if (!ready) return <div className="p-8 text-center text-muted-foreground">Yuklanmoqda...</div>;

  const lastAi = [...turns].reverse().find((t) => t.role === "ai");

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-2xl mx-auto">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">📖 {sessionId ? title : "Hikoya darslari"}</h1>
        {sessionId ? (
          <button className="btn-ghost text-sm" onClick={() => setSessionId(null)}>
            ← Ro'yxat
          </button>
        ) : (
          <Link to="/" className="btn-ghost text-sm">
            ← Panel
          </Link>
        )}
      </header>

      {err && <div className="mt-3 text-sm text-red-500">{err}</div>}

      {!sessionId && (
        <>
          {isLoading && <p className="mt-6 text-center text-muted-foreground">Yuklanmoqda...</p>}
          <div className="mt-4 grid sm:grid-cols-2 gap-3">
            {(scenarios ?? []).map((s) => (
              <button
                key={s.code}
                disabled={busy}
                onClick={() => begin(s.code)}
                className="card-surface p-4 text-left hover:bg-accent disabled:opacity-50"
              >
                <div className="text-2xl">{s.emoji ?? "🎬"}</div>
                <div className="mt-1 font-semibold">{s.title}</div>
                {s.description && (
                  <p className="text-sm text-muted-foreground mt-1">{s.description}</p>
                )}
              </button>
            ))}
          </div>
        </>
      )}

      {sessionId && (
        <>
          <div className="mt-4 space-y-3">
            {turns.map((t) => (
              <div
                key={t.id}
                className={`card-surface p-3 ${t.role === "user" ? "ml-8 bg-primary/5" : "mr-8"}`}
              >
                <div className="text-sm font-medium">{t.text}</div>
                {t.translation && (
                  <div className="text-xs text-muted-foreground mt-1">{t.translation}</div>
                )}
                {t.grammarNote && (
                  <div className="text-xs mt-2 rounded-lg bg-amber-500/10 border border-amber-500/30 p-2">
                    ✏️ {t.grammarNote}
                  </div>
                )}
              </div>
            ))}
          </div>

          {finished ? (
            <div className="mt-4 card-surface p-4 text-center">
              <div className="text-lg font-bold">🎉 Hikoya tugadi!</div>
              {reward && (
                <p className="mt-1 text-sm text-muted-foreground">
                  +{reward.xp} XP · +{reward.coins} 🪙
                </p>
              )}
              <button className="btn-primary mt-3" onClick={() => setSessionId(null)}>
                Yangi hikoya
              </button>
            </div>
          ) : (
            <>
              {(lastAi?.choices ?? []).length > 0 && (
                <div className="mt-4 space-y-2">
                  {lastAi?.choices.map((c) => (
                    <button
                      key={c}
                      disabled={busy}
                      onClick={() => send(c)}
                      className="w-full text-left card-surface p-3 text-sm hover:bg-accent disabled:opacity-50"
                    >
                      💬 {c}
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-4 flex gap-2">
                <input
                  className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
                  placeholder="O'z javobingizni yozing (inglizcha)"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") send(text);
                  }}
                />
                <button className="btn-primary disabled:opacity-40" disabled={busy || !text.trim()} onClick={() => send(text)}>
                  {busy ? "..." : "Yuborish"}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
