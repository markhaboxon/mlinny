import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getWritingTask, submitWriting } from "@/lib/ielts.functions";
import type { WritingScore } from "@/lib/ielts-types";

export const Route = createFileRoute("/ielts_/writing")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    mock: typeof s["mock"] === "string" ? (s["mock"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "IELTS Writing mashqi — Linny" },
      {
        name: "description",
        content: "Task 1 va Task 2 uchun IELTS Writing mashqi: so'z hisoblagich, taymer va 4 mezon bo'yicha AI baholash.",
      },
      { property: "og:title", content: "IELTS Writing mashqi — Linny" },
      { property: "og:description", content: "AI ekzaminator sizning esseyingizni band bo'yicha baholaydi." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WritingPage,
});

type Task = {
  id: string;
  task: 1 | 2;
  prompt: string;
  minWords: number;
  minutes: number;
  visual?: { title: string; rows: string[] };
};

const DRAFT_KEY = "linny_ielts_writing_draft";

function WritingPage() {
  const { mock } = Route.useSearch();
  const load = useServerFn(getWritingTask);
  const send = useServerFn(submitWriting);

  const [taskNo, setTaskNo] = useState<1 | 2>(2);
  const [task, setTask] = useState<Task | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [score, setScore] = useState<WritingScore | null>(null);
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    try {
      const d = localStorage.getItem(DRAFT_KEY);
      if (d) setText(d);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY, text); } catch { /* ignore */ }
  }, [text]);

  useEffect(() => {
    if (left === null || left <= 0 || score) return;
    const t = setTimeout(() => setLeft((v) => (v === null ? null : v - 1)), 1000);
    return () => clearTimeout(t);
  }, [left, score]);

  const words = useMemo(() => text.trim().split(/\s+/).filter(Boolean).length, [text]);

  async function pick(n: 1 | 2) {
    setTaskNo(n);
    setBusy(true);
    setErr(null);
    setScore(null);
    try {
      const t = (await load({ data: { task: n } })) as Task;
      setTask(t);
      setLeft(t.minutes * 60);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!task) return;
    setBusy(true);
    setErr(null);
    try {
      const r = (await send({
        data: {
          task: taskNo,
          taskId: task.id,
          prompt: task.prompt,
          text: text.trim(),
          mockId: mock ?? null,
        },
      })) as { score: WritingScore };
      setScore(r.score);
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen p-4 max-w-4xl mx-auto pb-16">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">✍️ IELTS Writing</h1>
        <Link to="/ielts" className="btn-ghost text-sm">← IELTS</Link>
      </div>

      <div className="flex gap-2 mt-4">
        <button onClick={() => pick(1)} className={taskNo === 1 && task ? "btn-primary text-sm" : "btn-ghost text-sm"}>Task 1</button>
        <button onClick={() => pick(2)} className={taskNo === 2 && task ? "btn-primary text-sm" : "btn-ghost text-sm"}>Task 2</button>
        {left !== null && !score && (
          <span className="ml-auto text-sm self-center">⏱ {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</span>
        )}
      </div>

      {!task && (
        <p className="text-sm text-muted-foreground mt-4">
          Task tanlang. Task 1 — 20 daqiqa / 150 so'z, Task 2 — 40 daqiqa / 250 so'z.
        </p>
      )}

      {score && (
        <div className="card-surface p-4 mt-4">
          <div className="text-lg font-semibold">Band {score.overall}</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-sm">
            <Metric label="Task" value={score.task_achievement} />
            <Metric label="Coherence" value={score.coherence_cohesion} />
            <Metric label="Lexis" value={score.lexical_resource} />
            <Metric label="Grammar" value={score.grammar} />
          </div>
          {!!score.strengths.length && (
            <>
              <h3 className="font-semibold mt-4 text-sm">✅ Kuchli tomonlar</h3>
              <ul className="list-disc pl-5 text-sm mt-1">{score.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </>
          )}
          {!!score.improvements.length && (
            <>
              <h3 className="font-semibold mt-3 text-sm">🎯 Yaxshilash kerak</h3>
              <ul className="list-disc pl-5 text-sm mt-1">{score.improvements.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </>
          )}
          {!!score.corrected_examples.length && (
            <>
              <h3 className="font-semibold mt-3 text-sm">✏️ Tuzatishlar</h3>
              <div className="space-y-2 mt-1">
                {score.corrected_examples.map((c, i) => (
                  <div key={i} className="text-sm rounded-lg border p-2">
                    <div className="line-through text-muted-foreground">{c.original}</div>
                    <div className="text-emerald-600">{c.corrected}</div>
                    <div className="text-xs text-muted-foreground mt-1">{c.reason}</div>
                  </div>
                ))}
              </div>
            </>
          )}
          <button onClick={() => pick(taskNo)} className="btn-primary mt-4 text-sm">Yangi mavzu</button>
        </div>
      )}

      {task && !score && (
        <>
          <div className="card-surface p-4 mt-4">
            <div className="text-xs text-muted-foreground">Task {task.task} • {task.minutes} daqiqa • kamida {task.minWords} so'z</div>
            <p className="text-sm mt-2 leading-relaxed">{task.prompt}</p>
            {task.visual && (
              <div className="mt-3 overflow-auto">
                <div className="text-sm font-medium">{task.visual.title}</div>
                <pre className="text-xs mt-1 whitespace-pre">{task.visual.rows.join("\n")}</pre>
              </div>
            )}
          </div>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={16}
            placeholder="Javobingizni shu yerga yozing..."
            className="mt-4 w-full rounded-xl border bg-background p-3 text-sm"
          />
          <div className="flex items-center gap-3 mt-2">
            <span className={`text-sm ${words < task.minWords ? "text-amber-600" : "text-emerald-600"}`}>
              {words} so'z (kamida {task.minWords})
            </span>
            <button onClick={submit} disabled={busy || words < 40} className="btn-primary ml-auto disabled:opacity-50">
              {busy ? "Baholanmoqda..." : "Baholash"}
            </button>
          </div>
        </>
      )}

      {err && <div className="mt-3 text-sm text-red-500">{err}</div>}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border p-2 text-center">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
