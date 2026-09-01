import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { startReading, submitObjective } from "@/lib/ielts.functions";
import type { ReadingPassage, GradedAnswer } from "@/lib/ielts-types";
import QuestionCard from "@/components/ielts/QuestionCard";

export const Route = createFileRoute("/ielts_/reading")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    mock: typeof s["mock"] === "string" ? (s["mock"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "IELTS Reading mashqi — Linny" },
      {
        name: "description",
        content: "3 ta matn, 40 savol: True/False/Not Given, headings, matching va boshqa barcha IELTS Reading turlari.",
      },
      { property: "og:title", content: "IELTS Reading mashqi — Linny" },
      { property: "og:description", content: "To'liq IELTS Reading mashqi va tezkor band hisobi." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReadingPage,
});

type Session = { sessionId: string; practice: boolean; totalQuestions: number; parts: ReadingPassage[] };

function ReadingPage() {
  const { mock } = Route.useSearch();
  const start = useServerFn(startReading);
  const submit = useServerFn(submitObjective);

  const [session, setSession] = useState<Session | null>(null);
  const [practice, setPractice] = useState(true);
  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ raw: number; total: number; band: number | null; answers: GradedAnswer[] } | null>(null);
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    if (left === null || result || left <= 0) return;
    const t = setTimeout(() => setLeft((v) => (v === null ? null : v - 1)), 1000);
    return () => clearTimeout(t);
  }, [left, result]);

  const part = session?.parts[idx];
  const answered = useMemo(() => Object.values(answers).filter(Boolean).length, [answers]);

  async function begin() {
    setBusy(true);
    setErr(null);
    try {
      const s = (await start({ data: { practice, mockId: mock ?? null } })) as Session;
      setSession(s);
      setAnswers({});
      setResult(null);
      setIdx(0);
      setLeft(practice ? null : 60 * 60);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    if (!session) return;
    setBusy(true);
    setErr(null);
    try {
      const r = (await submit({ data: { sessionId: session.sessionId, answers } })) as {
        raw: number; total: number; band: number | null; answers: GradedAnswer[];
      };
      setResult(r);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const graded = new Map((result?.answers ?? []).map((a) => [a.id, a]));

  return (
    <div className="min-h-screen p-4 max-w-6xl mx-auto pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">📖 IELTS Reading</h1>
        <Link to="/ielts" className="btn-ghost text-sm">← IELTS</Link>
      </div>

      {!session && (
        <div className="card-surface p-4 mt-4 space-y-3 max-w-2xl">
          <p className="text-sm text-muted-foreground">
            3 ta matn, 40 ta savol. Imtihon rejimida 60 daqiqa vaqt beriladi.
          </p>
          <div className="flex gap-2">
            <button onClick={() => setPractice(true)} className={practice ? "btn-primary text-sm" : "btn-ghost text-sm"}>Mashq</button>
            <button onClick={() => setPractice(false)} className={!practice ? "btn-primary text-sm" : "btn-ghost text-sm"}>Imtihon</button>
          </div>
          <button onClick={begin} disabled={busy} className="btn-primary w-full disabled:opacity-50">
            {busy ? "Matnlar tayyorlanmoqda..." : "Boshlash"}
          </button>
          {err && <div className="text-sm text-red-500">{err}</div>}
        </div>
      )}

      {result && (
        <div className="card-surface p-4 mt-4">
          <div className="text-lg font-semibold">
            Natija: {result.raw}/{result.total} • Band {result.band ?? "—"}
          </div>
          <button onClick={begin} className="btn-primary mt-3 text-sm">Yangi test</button>
        </div>
      )}

      {session && part && (
        <>
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            {session.parts.map((p, i) => (
              <button
                key={p.section}
                onClick={() => setIdx(i)}
                className={i === idx ? "btn-primary text-sm" : "btn-ghost text-sm"}
              >
                Passage {p.section}
              </button>
            ))}
            {left !== null && !result && (
              <span className="ml-auto text-sm">⏱ {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</span>
            )}
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <article className="card-surface p-4 lg:max-h-[75vh] lg:overflow-auto">
              <h2 className="font-semibold">{part.title}</h2>
              <div className="mt-3 space-y-3 text-sm leading-relaxed">
                {part.paragraphs.map((p) => (
                  <p key={p.label}>
                    <b className="mr-1">{p.label}</b>
                    {p.text}
                  </p>
                ))}
              </div>
            </article>

            <div className="card-surface p-4 lg:max-h-[75vh] lg:overflow-auto space-y-3">
              {part.questions.map((q) => {
                const g = graded.get(q.id);
                return (
                  <QuestionCard
                    key={q.id}
                    q={q}
                    value={answers[q.id] ?? ""}
                    disabled={!!result}
                    onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
                    {...(g ? { correct: g.correct, ok: g.ok, explain: g.explain } : {})}
                  />
                );
              })}
            </div>
          </div>

          {!result && (
            <div className="fixed bottom-0 left-0 right-0 p-3 bg-background/95 backdrop-blur border-t">
              <div className="max-w-6xl mx-auto flex items-center gap-3">
                <span className="text-sm text-muted-foreground">{answered}/{session.totalQuestions} javob</span>
                <button onClick={finish} disabled={busy} className="btn-primary ml-auto disabled:opacity-50">
                  {busy ? "Tekshirilmoqda..." : "Yakunlash"}
                </button>
              </div>
            </div>
          )}
          {err && <div className="mt-3 text-sm text-red-500">{err}</div>}
        </>
      )}
    </div>
  );
}
