import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { attachBot, botScore, findDuel, getDuel, reportDuel, type DuelMatch } from "@/lib/duel.functions";
import { useRequireRole } from "@/hooks/useRequireRole";
import { loadProfile } from "@/lib/profile";

export const Route = createFileRoute("/duel")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Duel — Linny" },
      { name: "description", content: "1v1 tezkor ingliz tili bahsi: lug'at va grammatika duellari." },
      { property: "og:title", content: "Duel — Linny" },
      { property: "og:description", content: "Do'stingiz yoki AI-bot bilan tezkor ingliz tili bahsi." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DuelPage,
});

const BOT_DELAY_MS = 3500;

function DuelPage() {
  const { state } = useRequireRole(["student", "user", "teacher", "admin"]);
  const ready = state === "ok";
  const find = useServerFn(findDuel);
  const read = useServerFn(getDuel);
  const attach = useServerFn(attachBot);
  const bot = useServerFn(botScore);
  const report = useServerFn(reportDuel);
  const qc = useQueryClient();

  const [match, setMatch] = useState<DuelMatch | null>(null);
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ result: string | null; coins: number; xp: number } | null>(null);
  const botTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const profile = loadProfile();

  // Realtime: raqib qo'shilishi va ballari
  useEffect(() => {
    if (!match) return;
    const ch = supabase
      .channel(`duel-${match.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "duel_matches", filter: `id=eq.${match.id}` },
        () => {
          read({ data: { matchId: match.id } })
            .then((m) => m && setMatch(m))
            .catch(() => {});
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [match?.id, read]);

  // Raqib topilmasa 10 soniyadan keyin AI-bot biriktiriladi
  useEffect(() => {
    if (!match || match.status !== "waiting") return;
    const t = setTimeout(() => {
      attach({ data: { matchId: match.id } })
        .then(() => read({ data: { matchId: match.id } }))
        .then((m) => m && setMatch(m))
        .catch(() => {});
    }, 10_000);
    return () => clearTimeout(t);
  }, [match?.id, match?.status, attach, read]);

  // Bot o'ynayotgan bo'lsa ballarini bosqichma-bosqich yuboramiz
  useEffect(() => {
    if (!match?.isBot || match.status !== "playing") return;
    let botPoints = 0;
    const total = match.questions.length;
    botTimer.current = setInterval(() => {
      if (botPoints >= total) {
        if (botTimer.current) clearInterval(botTimer.current);
        return;
      }
      if (Math.random() < 0.7) botPoints += 1;
      const done = botPoints >= total;
      bot({ data: { matchId: match.id, score: botPoints, finished: done } }).catch(() => {});
    }, BOT_DELAY_MS);
    return () => {
      if (botTimer.current) clearInterval(botTimer.current);
    };
  }, [match?.id, match?.isBot, match?.status, bot]);

  async function begin() {
    setBusy(true);
    setErr(null);
    setResult(null);
    setIdx(0);
    setScore(0);
    setPicked(null);
    try {
      const m = await find({
        data: {
          name: profile.name ?? "O'quvchi",
          level: (profile.levelChosen as "past" | "orta" | "yaxshi") ?? "orta",
          topic: "umumiy",
          count: 6,
        },
      });
      setMatch(m);
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  }

  async function pick(i: number) {
    if (!match || picked !== null) return;
    setPicked(i);
    const correct = i === match.questions[idx]?.answerIndex;
    const next = correct ? score + 1 : score;
    setScore(next);
    const last = idx + 1 >= match.questions.length;
    try {
      const res = await report({ data: { matchId: match.id, score: next, finished: last } });
      if (last) {
        setResult({ result: res.result, coins: res.coins, xp: res.xp });
        qc.invalidateQueries({ queryKey: ["game-state"] });
      }
    } catch (e) {
      setErr((e as Error).message);
    }
    setTimeout(() => {
      setPicked(null);
      if (!last) setIdx((v) => v + 1);
    }, 900);
  }

  if (!ready) return <div className="p-8 text-center text-muted-foreground">Yuklanmoqda...</div>;

  const myScore = match ? (match.meIsP1 ? match.p1Score : match.p2Score) : 0;
  const oppScore = match ? (match.meIsP1 ? match.p2Score : match.p1Score) : 0;
  const oppName = match ? (match.meIsP1 ? match.p2Name : match.p1Name) : null;
  const q = match?.questions[idx];

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-2xl mx-auto">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">⚔️ Duel</h1>
        <Link to="/" className="btn-ghost text-sm">
          ← Panel
        </Link>
      </header>

      {err && <div className="mt-3 text-sm text-red-500">{err}</div>}

      {!match && (
        <div className="mt-6 card-surface p-6 text-center">
          <p className="text-sm text-muted-foreground">
            6 ta tezkor savol. Raqib topilmasa AI-bot bilan o'ynaysiz. G'olib tanga va XP oladi.
          </p>
          <button className="btn-primary mt-4 disabled:opacity-40" disabled={busy} onClick={begin}>
            {busy ? "Raqib qidirilmoqda..." : "🔎 Raqib qidirish"}
          </button>
        </div>
      )}

      {match && match.status === "waiting" && (
        <div className="mt-6 card-surface p-6 text-center">
          <div className="text-lg font-semibold">Raqib kutilmoqda...</div>
          <p className="mt-1 text-sm text-muted-foreground">
            10 soniyada topilmasa AI-bot qo'shiladi.
          </p>
        </div>
      )}

      {match && match.status !== "waiting" && (
        <>
          <div className="mt-4 card-surface p-4 flex items-center justify-between">
            <div className="text-center">
              <div className="text-2xl font-bold">{myScore}</div>
              <div className="text-xs text-muted-foreground">Siz</div>
            </div>
            <div className="text-sm text-muted-foreground">
              {idx + 1}/{match.questions.length}
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{oppScore}</div>
              <div className="text-xs text-muted-foreground">
                {oppName ?? "Raqib"} {match.isBot ? "🤖" : ""}
              </div>
            </div>
          </div>

          {result ? (
            <div className="mt-6 card-surface p-6 text-center">
              <div className="text-2xl font-bold">
                {result.result === "win" ? "🏆 G'alaba!" : result.result === "lose" ? "😕 Yutqazdingiz" : "🤝 Durang"}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                +{result.xp} XP · +{result.coins} 🪙
              </p>
              <button className="btn-primary mt-4" onClick={() => setMatch(null)}>
                Yana o'ynash
              </button>
            </div>
          ) : (
            q && (
              <div className="mt-4 card-surface p-5">
                <div className="text-lg font-semibold">{q.q}</div>
                <div className="mt-4 grid gap-2">
                  {q.choices.map((c, i) => {
                    const isRight = i === q.answerIndex;
                    const show = picked !== null;
                    return (
                      <button
                        key={c}
                        disabled={show}
                        onClick={() => pick(i)}
                        className={`p-3 rounded-2xl border text-left text-sm ${
                          show && isRight
                            ? "border-emerald-500 bg-emerald-500/10"
                            : show && picked === i
                              ? "border-red-500 bg-red-500/10"
                              : "hover:bg-accent"
                        }`}
                      >
                        {c}
                      </button>
                    );
                  })}
                </div>
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}
