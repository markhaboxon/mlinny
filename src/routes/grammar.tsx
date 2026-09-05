import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  finishGrammarQuiz,
  grammarLesson,
  GRAMMAR_TOPICS,
  type GrammarLesson,
} from "@/lib/practice.functions";
import { useRequireRole } from "@/hooks/useRequireRole";
import { loadProfile } from "@/lib/profile";

export const Route = createFileRoute("/grammar")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Grammatika darslari — Linny" },
      {
        name: "description",
        content:
          "Ingliz tili grammatikasi o'zbekcha tushuntirishlar, misollar, ko'p uchraydigan xatolar va mini test bilan.",
      },
      { property: "og:title", content: "Grammatika darslari — Linny" },
      { property: "og:description", content: "Har bir mavzu bo'yicha sodda tushuntirish va test." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GrammarPage,
});

function GrammarPage() {
  const { state } = useRequireRole(["student", "user", "teacher", "admin"]);
  const ready = state === "ok";
  const lessonFn = useServerFn(grammarLesson);
  const finishFn = useServerFn(finishGrammarQuiz);
  const level = (loadProfile().levelChosen ?? "orta") as "past" | "orta" | "yaxshi";

  const [topic, setTopic] = useState<string | null>(null);
  const [lesson, setLesson] = useState<GrammarLesson | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [done, setDone] = useState(false);

  async function open(t: string) {
    setTopic(t);
    setLesson(null);
    setAnswers({});
    setDone(false);
    setErr(null);
    setBusy(true);
    try {
      setLesson((await lessonFn({ data: { topic: t, level } })) as GrammarLesson);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Darsni yuklab bo'lmadi.");
    } finally {
      setBusy(false);
    }
  }

  const correct = lesson
    ? lesson.quiz.filter((q, i) => answers[i] === q.answerIndex).length
    : 0;
  const answered = lesson ? lesson.quiz.filter((_, i) => answers[i] !== undefined).length : 0;

  async function finish() {
    if (!lesson) return;
    setDone(true);
    try {
      await finishFn({ data: { correct, total: lesson.quiz.length } });
    } catch {
      /* mukofotsiz ham natija ko'rinadi */
    }
  }

  return (
    <main className="mx-auto max-w-2xl p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">📚 Grammatika darslari</h1>
        <Link to="/" className="btn-ghost text-sm">
          ← Bosh sahifa
        </Link>
      </div>

      {!topic ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {GRAMMAR_TOPICS.map((t) => (
            <button key={t} className="card-surface p-3 text-left hover:opacity-90" onClick={() => void open(t)} disabled={!ready}>
              <span className="font-semibold">{t}</span>
            </button>
          ))}
        </div>
      ) : (
        <>
          <button className="btn-ghost text-sm mt-3" onClick={() => setTopic(null)}>
            ← Mavzular
          </button>

          {busy && <p className="card-surface p-6 mt-3 text-center text-muted-foreground">Dars tayyorlanmoqda…</p>}
          {err && <p className="card-surface p-4 mt-3 text-sm text-red-600/80">{err}</p>}

          {lesson && (
            <article className="mt-3 space-y-4">
              <section className="card-surface p-4">
                <h2 className="text-xl font-bold">{lesson.title}</h2>
                <p className="mt-2 text-sm whitespace-pre-line">{lesson.explanation}</p>
              </section>

              <section className="card-surface p-4">
                <h3 className="font-bold">📌 Qoidalar</h3>
                <ul className="mt-2 space-y-2 text-sm">
                  {lesson.rules.map((r, i) => (
                    <li key={i}>
                      <div>{r.rule}</div>
                      <div className="text-muted-foreground italic">{r.example}</div>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="card-surface p-4">
                <h3 className="font-bold">⚠️ Ko'p uchraydigan xatolar</h3>
                <ul className="mt-2 space-y-2 text-sm">
                  {lesson.mistakes.map((m, i) => (
                    <li key={i}>
                      <span className="text-red-500 line-through">{m.wrong}</span>{" "}
                      <span className="font-semibold text-emerald-600">{m.right}</span>
                      <div className="text-muted-foreground">{m.why}</div>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="card-surface p-4">
                <h3 className="font-bold">🧪 Mini test</h3>
                <div className="mt-2 space-y-4">
                  {lesson.quiz.map((q, i) => {
                    const picked = answers[i];
                    return (
                      <div key={i}>
                        <p className="font-medium text-sm">
                          {i + 1}. {q.question}
                        </p>
                        <div className="mt-2 grid gap-2">
                          {q.options.map((o, oi) => {
                            const isPicked = picked === oi;
                            const isRight = oi === q.answerIndex;
                            const show = picked !== undefined;
                            return (
                              <button
                                key={oi}
                                disabled={show}
                                onClick={() => setAnswers((a) => ({ ...a, [i]: oi }))}
                                className={`btn-ghost text-left text-sm ${
                                  show && isRight
                                    ? "ring-2 ring-emerald-500"
                                    : show && isPicked
                                      ? "ring-2 ring-red-500"
                                      : ""
                                }`}
                              >
                                {o}
                              </button>
                            );
                          })}
                        </div>
                        {picked !== undefined && (
                          <p className="mt-1 text-xs text-muted-foreground">{q.explain}</p>
                        )}
                      </div>
                    );
                  })}
                </div>

                {answered === lesson.quiz.length && !done && (
                  <button className="btn-primary mt-4" onClick={() => void finish()}>
                    Yakunlash
                  </button>
                )}
                {done && (
                  <p className="mt-4 font-bold">
                    Natija: {correct}/{lesson.quiz.length} — XP hisobingizga qo'shildi 🎉
                  </p>
                )}
              </section>
            </article>
          )}
        </>
      )}
    </main>
  );
}
