import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  gradePronunciation,
  pronouncePrompts,
  pronunciationHistory,
  type PronFeedback,
} from "@/lib/pronounce.functions";
import { useRequireRole } from "@/hooks/useRequireRole";
import { loadProfile } from "@/lib/profile";

export const Route = createFileRoute("/pronounce")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Talaffuz murabbiysi — Linny" },
      {
        name: "description",
        content:
          "Jumlani ovoz chiqarib o'qing — AI talaffuzingizni baholab, qaysi tovushni qanday tuzatishni o'zbekcha tushuntiradi.",
      },
      { property: "og:title", content: "Talaffuz murabbiysi — Linny" },
      { property: "og:description", content: "AI talaffuz tahlili va tovushlar bo'yicha maslahatlar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PronouncePage,
});

type Rec = {
  start: () => void;
  stop: () => void;
  abort: () => void;
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: unknown) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onend: (() => void) | null;
};

function createRecognizer(): Rec | null {
  const w = window as unknown as Record<string, unknown>;
  const Ctor = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as
    | (new () => Rec)
    | undefined;
  if (!Ctor) return null;
  return new Ctor();
}

function PronouncePage() {
  const { state } = useRequireRole(["student", "user", "teacher", "admin"]);
  const ready = state === "ok";
  const prompts = useServerFn(pronouncePrompts);
  const grade = useServerFn(gradePronunciation);
  const history = useServerFn(pronunciationHistory);

  const level = (loadProfile().levelChosen ?? "orta") as "past" | "orta" | "yaxshi";
  const [idx, setIdx] = useState(0);
  const [heard, setHeard] = useState("");
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fb, setFb] = useState<PronFeedback | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);
  const recRef = useRef<Rec | null>(null);

  const { data: items, isLoading } = useQuery({
    queryKey: ["pron-prompts", level],
    queryFn: () => prompts({ data: { level } }),
    enabled: ready,
    retry: false,
    staleTime: 10 * 60_000,
  });

  const { data: hist, refetch: refetchHist } = useQuery({
    queryKey: ["pron-history"],
    queryFn: () => history(),
    enabled: ready,
    retry: false,
  });

  useEffect(() => {
    setSupported(!!createRecognizer());
    return () => recRef.current?.abort();
  }, []);

  const task = items?.[idx];

  function speak(text: string) {
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US";
      u.rate = 0.9;
      window.speechSynthesis.speak(u);
    } catch {
      /* ovoz bo'lmasa jim */
    }
  }

  function listen() {
    setErr(null);
    setFb(null);
    setHeard("");
    const rec = createRecognizer();
    if (!rec) {
      setSupported(false);
      return;
    }
    recRef.current = rec;
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e: unknown) => {
      const ev = e as { results: ArrayLike<ArrayLike<{ transcript: string }>> };
      let text = "";
      for (let i = 0; i < ev.results.length; i++) text += ev.results[i][0].transcript;
      setHeard(text.trim());
    };
    rec.onerror = () => {
      setListening(false);
      setErr("Mikrofonni eshitib bo'lmadi. Ruxsat berilganini tekshiring.");
    };
    rec.onend = () => setListening(false);
    setListening(true);
    rec.start();
  }

  async function check() {
    if (!task || !heard.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await grade({ data: { target: task.text, heard: heard.trim() } });
      setFb(r);
      refetchHist();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Tahlil qilib bo'lmadi");
    } finally {
      setBusy(false);
    }
  }

  function nextTask() {
    setFb(null);
    setHeard("");
    setIdx((n) => (items && n + 1 < items.length ? n + 1 : 0));
  }

  if (!ready || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="card-surface p-8">🎤 Mashqlar tayyorlanmoqda...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <Link to="/" className="btn-ghost text-sm">← Panelga</Link>
        {items && <div className="text-xs text-muted-foreground">{idx + 1} / {items.length}</div>}
      </div>

      <h1 className="mt-6 text-2xl md:text-3xl font-bold">Talaffuz murabbiysi 🎤</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Jumlani tinglang, keyin ovoz chiqarib o'qing — AI qaysi tovushni qanday tuzatishni aytadi.
      </p>

      {!supported && (
        <div className="mt-4 card-surface p-4 text-sm">
          ⚠️ Brauzeringiz nutqni tanimaydi. Chrome yoki Edge'da oching, yoki eshitgan matnni qo'lda yozing.
        </div>
      )}

      {task && (
        <div className="mt-5 card-surface p-6">
          <div className="text-xs uppercase text-muted-foreground">O'qing</div>
          <div className="mt-2 text-xl md:text-2xl font-semibold">{task.text}</div>
          <div className="mt-2 text-sm text-muted-foreground">💡 {task.focus}</div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => speak(task.text)} className="btn-ghost text-sm">🔊 Namuna</button>
            {!listening ? (
              <button onClick={listen} className="btn-primary text-sm">🎤 Gapirish</button>
            ) : (
              <button onClick={() => recRef.current?.stop()} className="btn-primary text-sm animate-pulse">
                ⏹ To'xtatish
              </button>
            )}
            <button onClick={nextTask} className="btn-ghost text-sm">Keyingi →</button>
          </div>

          <textarea
            value={heard}
            onChange={(e) => setHeard(e.target.value)}
            rows={2}
            placeholder="Aytganingiz shu yerda chiqadi (qo'lda ham yozish mumkin)"
            className="mt-4 w-full rounded-2xl border p-3 bg-background text-sm"
          />

          <button
            onClick={check}
            disabled={busy || !heard.trim()}
            className="btn-primary mt-3 disabled:opacity-40"
          >
            {busy ? "Tahlil qilinmoqda..." : "Tekshirish"}
          </button>
          {err && <div className="mt-3 text-sm text-red-500">{err}</div>}
        </div>
      )}

      {fb && (
        <div className="mt-4 card-surface p-6">
          <div className="flex items-baseline gap-3">
            <div className="text-3xl font-bold">{fb.score}</div>
            <div className="text-sm text-muted-foreground">/ 100</div>
          </div>
          <div className="mt-2 text-sm">{fb.summary}</div>
          {fb.problems.length > 0 && (
            <div className="mt-4 space-y-2">
              {fb.problems.map((p, i) => (
                <div key={i} className="rounded-xl bg-accent p-3 text-sm">
                  <div className="font-semibold">{p.word}</div>
                  <div className="text-muted-foreground">{p.issue}</div>
                  <div className="mt-1">✅ {p.tip}</div>
                </div>
              ))}
            </div>
          )}
          {fb.tips.length > 0 && (
            <ul className="mt-4 list-disc pl-5 text-sm space-y-1">
              {fb.tips.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          )}
          <button onClick={nextTask} className="btn-primary mt-4">Keyingi jumla →</button>
        </div>
      )}

      {hist && hist.length > 0 && (
        <div className="mt-8 card-surface p-4">
          <div className="font-semibold text-sm">Oxirgi urinishlar</div>
          <div className="mt-2 space-y-1 text-sm">
            {hist.map((h) => (
              <div key={h.id} className="flex justify-between gap-3">
                <span className="truncate text-muted-foreground">{h.target}</span>
                <span className="font-semibold">{h.score}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
