import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { dictationBatch, gradeDictation } from "@/lib/practice.functions";
import { useRequireRole } from "@/hooks/useRequireRole";
import { loadProfile } from "@/lib/profile";

export const Route = createFileRoute("/dictation")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Diktant — eshitib yozish | Linny" },
      {
        name: "description",
        content:
          "Jumlani tinglang va yozing — Linny har bir so'zni tekshirib, xatolaringizni ko'rsatadi va XP beradi.",
      },
      { property: "og:title", content: "Diktant — eshitib yozish | Linny" },
      { property: "og:description", content: "Tinglab tushunish va imloni bir vaqtda mashq qiling." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DictationPage,
});

type Result = { score: number; correct: number; total: number; diff: { expected: string; got: string | null }[] };

function speak(text: string, rate: number) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = rate;
  window.speechSynthesis.speak(u);
}

function DictationPage() {
  const { state } = useRequireRole(["student", "user", "teacher", "admin"]);
  const ready = state === "ok";
  const batch = useServerFn(dictationBatch);
  const grade = useServerFn(gradeDictation);
  const level = (loadProfile().levelChosen ?? "orta") as "past" | "orta" | "yaxshi";

  const [idx, setIdx] = useState(0);
  const [typed, setTyped] = useState("");
  const [res, setRes] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["dictation", level],
    queryFn: () => batch({ data: { level } }),
    enabled: ready,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const items = data ?? [];
  const cur = items[idx];

  async function check() {
    if (!cur) return;
    setBusy(true);
    try {
      setRes((await grade({ data: { target: cur.text, typed } })) as Result);
    } finally {
      setBusy(false);
    }
  }

  function next() {
    setRes(null);
    setTyped("");
    setShowHint(false);
    if (idx + 1 < items.length) setIdx(idx + 1);
    else {
      setIdx(0);
      void refetch();
    }
  }

  return (
    <main className="mx-auto max-w-2xl p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">🎧 Diktant</h1>
        <Link to="/" className="btn-ghost text-sm">
          ← Bosh sahifa
        </Link>
      </div>
      <p className="text-sm text-muted-foreground mt-1">
        Jumlani tinglang va eshitganingizni yozing. Har bir so'z alohida tekshiriladi.
      </p>

      {!ready || isLoading || isFetching ? (
        <p className="card-surface p-6 mt-4 text-center text-muted-foreground">Tayyorlanmoqda…</p>
      ) : !cur ? (
        <p className="card-surface p-6 mt-4 text-center text-muted-foreground">Jumlalar topilmadi.</p>
      ) : (
        <section className="card-surface p-4 mt-4">
          <div className="text-xs text-muted-foreground">
            {idx + 1} / {items.length}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn-primary" onClick={() => speak(cur.text, 0.95)}>
              🔊 Tinglash
            </button>
            <button className="btn-ghost" onClick={() => speak(cur.text, 0.6)}>
              🐢 Sekin
            </button>
            <button className="btn-ghost" onClick={() => setShowHint((v) => !v)}>
              💡 Tarjima
            </button>
          </div>
          {showHint && <p className="mt-2 text-sm text-muted-foreground">{cur.hint}</p>}

          <textarea
            className="mt-3 w-full rounded-xl border border-border bg-background p-3 text-base"
            rows={3}
            placeholder="Eshitganingizni shu yerga yozing…"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            disabled={!!res}
          />

          {!res ? (
            <button className="btn-primary mt-3" disabled={busy || !typed.trim()} onClick={() => void check()}>
              {busy ? "Tekshirilmoqda…" : "Tekshirish"}
            </button>
          ) : (
            <div className="mt-3">
              <div className="text-lg font-bold">
                {res.score >= 90 ? "🎉" : res.score >= 70 ? "👍" : "💪"} {res.score}% — {res.correct}/{res.total}{" "}
                so'z to'g'ri
              </div>
              <p className="mt-2 text-sm">
                <span className="text-muted-foreground">To'g'ri javob: </span>
                {cur.text}
              </p>
              {res.diff.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm">
                  {res.diff.map((d, i) => (
                    <li key={i}>
                      <span className="text-red-500">{d.got ?? "—"}</span> →{" "}
                      <span className="font-semibold text-emerald-600">{d.expected}</span>
                    </li>
                  ))}
                </ul>
              )}
              <button className="btn-primary mt-3" onClick={next}>
                Keyingisi →
              </button>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
