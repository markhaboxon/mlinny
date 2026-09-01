import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { startListening, submitObjective } from "@/lib/ielts.functions";
import type { ListeningSection, GradedAnswer } from "@/lib/ielts-types";
import QuestionCard from "@/components/ielts/QuestionCard";

export const Route = createFileRoute("/ielts_/listening")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    mock: typeof s["mock"] === "string" ? (s["mock"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "IELTS Listening mashqi — Linny" },
      {
        name: "description",
        content: "4 bo'limli IELTS Listening mashqi: ovozli dialog, real savol turlari va band score.",
      },
      { property: "og:title", content: "IELTS Listening mashqi — Linny" },
      { property: "og:description", content: "Ovozli IELTS Listening mashqi va AI baholash." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ListeningPage,
});

type Session = {
  sessionId: string;
  totalQuestions: number;
  practice: boolean;
  parts: ListeningSection[];
};

function pickVoice(gender: "male" | "female") {
  if (typeof window === "undefined") return null;
  const voices = window.speechSynthesis?.getVoices?.() ?? [];
  const en = voices.filter((v) => v.lang?.toLowerCase().startsWith("en"));
  if (!en.length) return null;
  const wanted = gender === "female" ? /female|zira|samantha|karen|aria|jenny/i : /male|david|daniel|george|guy/i;
  return en.find((v) => wanted.test(v.name)) ?? en[gender === "female" ? 0 : Math.min(1, en.length - 1)] ?? null;
}

function ListeningPage() {
  const { mock } = Route.useSearch();
  const start = useServerFn(startListening);
  const submit = useServerFn(submitObjective);

  const [session, setSession] = useState<Session | null>(null);
  const [practice, setPractice] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ raw: number; total: number; band: number | null; answers: GradedAnswer[] } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [played, setPlayed] = useState<Record<number, number>>({});
  const [left, setLeft] = useState<number | null>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    if (typeof window !== "undefined") window.speechSynthesis?.getVoices?.();
    return () => {
      cancelled.current = true;
      if (typeof window !== "undefined") window.speechSynthesis?.cancel?.();
    };
  }, []);

  useEffect(() => {
    if (left === null || result) return;
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((v) => (v === null ? null : v - 1)), 1000);
    return () => clearTimeout(t);
  }, [left, result]);

  const questions = useMemo(
    () => (session?.parts ?? []).flatMap((p) => p.questions),
    [session],
  );

  async function begin() {
    setBusy(true);
    setErr(null);
    try {
      const s = (await start({ data: { practice, mockId: mock ?? null } })) as Session;
      setSession(s);
      setAnswers({});
      setResult(null);
      setPlayed({});
      setLeft(practice ? null : 30 * 60);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function speak(section: ListeningSection) {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      setErr("Brauzeringiz ovoz chiqarishni qo'llab-quvvatlamaydi.");
      return;
    }
    if (!session?.practice && (played[section.section] ?? 0) >= 1) return;
    window.speechSynthesis.cancel();
    setPlaying(true);
    setPlayed((p) => ({ ...p, [section.section]: (p[section.section] ?? 0) + 1 }));

    const utts = section.lines.map((line) => {
      const u = new SpeechSynthesisUtterance(line.text);
      const v = pickVoice(line.gender);
      if (v) u.voice = v;
      u.lang = v?.lang ?? "en-GB";
      u.rate = 0.95;
      return u;
    });
    utts.forEach((u, i) => {
      if (i === utts.length - 1) u.onend = () => setPlaying(false);
      window.speechSynthesis.speak(u);
    });
    if (!utts.length) setPlaying(false);
  }

  function stop() {
    window.speechSynthesis?.cancel();
    setPlaying(false);
  }

  async function finish() {
    if (!session) return;
    setBusy(true);
    setErr(null);
    try {
      const r = (await submit({ data: { sessionId: session.sessionId, answers } })) as {
        raw: number;
        total: number;
        band: number | null;
        answers: GradedAnswer[];
      };
      setResult(r);
      stop();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const graded = new Map((result?.answers ?? []).map((a) => [a.id, a]));

  return (
    <div className="min-h-screen p-4 max-w-3xl mx-auto pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">🎧 IELTS Listening</h1>
        <Link to="/ielts" className="btn-ghost text-sm">← IELTS</Link>
      </div>

      {!session && (
        <div className="card-surface p-4 mt-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            4 ta bo'lim, 40 ta savol. Imtihon rejimida har bir yozuv <b>faqat bir marta</b> eshitiladi
            va 30 daqiqa vaqt beriladi.
          </p>
          <div className="flex gap-2">
            <button onClick={() => setPractice(true)} className={practice ? "btn-primary text-sm" : "btn-ghost text-sm"}>
              Mashq rejimi
            </button>
            <button onClick={() => setPractice(false)} className={!practice ? "btn-primary text-sm" : "btn-ghost text-sm"}>
              Imtihon rejimi
            </button>
          </div>
          <button onClick={begin} disabled={busy} className="btn-primary w-full disabled:opacity-50">
            {busy ? "Tayyorlanmoqda..." : "Boshlash"}
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

      {session && (
        <>
          {left !== null && !result && (
            <div className="sticky top-0 z-10 mt-3 rounded-xl bg-background/90 backdrop-blur border p-2 text-center text-sm">
              ⏱ {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
            </div>
          )}
          {session.parts.map((part) => (
            <section key={part.section} className="card-surface p-4 mt-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="font-semibold">Section {part.section} — {part.title}</h2>
                  <p className="text-xs text-muted-foreground mt-1">{part.instructions}</p>
                </div>
                {!result && (
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => speak(part)}
                      disabled={!session.practice && (played[part.section] ?? 0) >= 1}
                      className="btn-primary text-sm disabled:opacity-40"
                    >
                      ▶︎ Eshitish
                    </button>
                    {playing && (
                      <button onClick={stop} className="btn-ghost text-sm">⏹</button>
                    )}
                  </div>
                )}
              </div>

              {result && (
                <details className="mt-3">
                  <summary className="text-sm cursor-pointer">Transkript</summary>
                  <div className="mt-2 space-y-1 text-sm">
                    {part.lines.map((l, i) => (
                      <p key={i}><b>{l.speaker}:</b> {l.text}</p>
                    ))}
                  </div>
                </details>
              )}

              <div className="mt-3 space-y-3">
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
            </section>
          ))}

          {!result && (
            <div className="fixed bottom-0 left-0 right-0 p-3 bg-background/95 backdrop-blur border-t">
              <div className="max-w-3xl mx-auto flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  {Object.values(answers).filter(Boolean).length}/{questions.length} javob
                </span>
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
