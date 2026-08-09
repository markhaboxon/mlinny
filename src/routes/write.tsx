import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { gradeSubmission, listMySubmissions, type AiFeedback } from "@/lib/grading.functions";
import { useRequireRole } from "@/hooks/useRequireRole";

export const Route = createFileRoute("/write")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "AI tekshiruvi — Linny" },
      { name: "description", content: "Insho yoki nutqingizni yuboring — AI ball qo'yib, xatolarni tuzatadi." },
      { property: "og:title", content: "AI tekshiruvi — Linny" },
      { property: "og:description", content: "Insho va speaking uchun batafsil AI fikr-mulohaza." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WritePage,
});

function FeedbackCard({ fb }: { fb: AiFeedback }) {
  return (
    <div className="mt-3 space-y-3">
      <div className="text-3xl font-bold">{fb.score}/100</div>
      <p className="text-sm">{fb.summary}</p>
      {fb.strengths.length > 0 && (
        <div>
          <div className="text-xs uppercase text-muted-foreground">Kuchli tomonlar</div>
          <ul className="mt-1 text-sm list-disc pl-5 space-y-1">
            {fb.strengths.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      )}
      {fb.improvements.length > 0 && (
        <div>
          <div className="text-xs uppercase text-muted-foreground">Yaxshilash kerak</div>
          <ul className="mt-1 text-sm list-disc pl-5 space-y-1">
            {fb.improvements.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      )}
      {fb.corrections.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs uppercase text-muted-foreground">Tuzatishlar</div>
          {fb.corrections.map((c) => (
            <div key={c.original} className="rounded-lg border border-border p-3 text-sm">
              <div className="line-through opacity-70">{c.original}</div>
              <div className="font-medium text-emerald-600 dark:text-emerald-400">{c.better}</div>
              <div className="text-xs text-muted-foreground mt-1">{c.why}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WritePage() {
  const { state } = useRequireRole(["student", "user", "teacher", "admin"]);
  const ready = state === "ok";
  const grade = useServerFn(gradeSubmission);
  const listMine = useServerFn(listMySubmissions);
  const qc = useQueryClient();

  const [kind, setKind] = useState<"essay" | "speaking">("essay");
  const [prompt, setPrompt] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fb, setFb] = useState<AiFeedback | null>(null);

  const { data: history } = useQuery({
    queryKey: ["my-submissions"],
    queryFn: () => listMine(),
    enabled: ready,
    retry: false,
  });

  async function submit() {
    setBusy(true);
    setErr(null);
    setFb(null);
    try {
      const res = await grade({
        data: { kind, prompt: prompt.trim() || undefined, content: content.trim() },
      });
      setFb(res.feedback);
      setContent("");
      qc.invalidateQueries({ queryKey: ["my-submissions"] });
      qc.invalidateQueries({ queryKey: ["game-state"] });
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  }

  if (!ready) return <div className="p-8 text-center text-muted-foreground">Yuklanmoqda...</div>;

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-2xl mx-auto">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">✍️ AI tekshiruvi</h1>
        <Link to="/" className="btn-ghost text-sm">
          ← Panel
        </Link>
      </header>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {(["essay", "speaking"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`p-3 rounded-2xl border text-sm ${
              kind === k ? "border-primary bg-primary/10 font-semibold" : "hover:bg-accent"
            }`}
          >
            {k === "essay" ? "📝 Insho" : "🎤 Speaking (matn)"}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        <input
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          placeholder="Topshiriq mavzusi (ixtiyoriy)"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <textarea
          className="w-full min-h-40 rounded-md border border-border bg-background px-3 py-2 text-sm"
          placeholder="Inglizcha matningizni shu yerga yozing (kamida 20 belgi)"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <button
          className="btn-primary w-full disabled:opacity-40"
          disabled={busy || content.trim().length < 20}
          onClick={submit}
        >
          {busy ? "Tekshirilmoqda..." : "AI ga yuborish"}
        </button>
        {err && <div className="text-sm text-red-500">{err}</div>}
      </div>

      {fb && (
        <div className="mt-6 card-surface p-5">
          <div className="text-xs uppercase text-muted-foreground">Natija</div>
          <FeedbackCard fb={fb} />
        </div>
      )}

      {(history ?? []).length > 0 && (
        <div className="mt-8">
          <div className="text-xs uppercase text-muted-foreground">Oldingi ishlar</div>
          <div className="mt-2 space-y-2">
            {(history ?? []).map((s) => (
              <div key={s.id} className="card-surface p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {s.kind === "essay" ? "📝 Insho" : "🎤 Speaking"} · {s.score ?? "-"}/100
                  </span>
                  <span className="text-xs text-muted-foreground">{s.createdAt.slice(0, 10)}</span>
                </div>
                <p className="mt-1 text-muted-foreground line-clamp-2">{s.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
