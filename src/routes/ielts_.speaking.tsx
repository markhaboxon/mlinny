import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getSpeakingTest, submitSpeaking } from "@/lib/ielts.functions";
import type { SpeakingScore } from "@/lib/ielts-types";

export const Route = createFileRoute("/ielts_/speaking")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    mock: typeof s["mock"] === "string" ? (s["mock"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "IELTS Speaking mashqi — Linny" },
      {
        name: "description",
        content: "3 qismli IELTS Speaking intervyusi: ovoz yozib oling, AI ekzaminator talaffuz va grammatikangizni band bo'yicha baholaydi.",
      },
      { property: "og:title", content: "IELTS Speaking mashqi — Linny" },
      { property: "og:description", content: "Ovozli IELTS Speaking mashqi va AI fikr-mulohaza." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SpeakingPage,
});

type SpeakingSet = {
  id: string;
  part1: { topic: string; questions: string[] }[];
  part2: { cue: string; bullets: string[] };
  part3: string[];
};

type SR = {
  start: () => void;
  stop: () => void;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
};

function newRecognition(): SR | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) return null;
  const r = new Ctor();
  r.continuous = true;
  r.interimResults = false;
  r.lang = "en-GB";
  return r;
}

function SpeakingPage() {
  const { mock } = Route.useSearch();
  const load = useServerFn(getSpeakingTest);
  const send = useServerFn(submitSpeaking);

  const [set, setSet] = useState<SpeakingSet | null>(null);
  const [part, setPart] = useState<1 | 2 | 3>(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [transcript, setTranscript] = useState("");
  const [score, setScore] = useState<SpeakingScore | null>(null);

  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const rec = useRef<SR | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setSet((await load()) as SpeakingSet);
      } catch (e) {
        setErr((e as Error).message);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  const questions = useMemo(() => {
    if (!set) return [];
    if (part === 1) return set.part1.flatMap((b) => b.questions);
    if (part === 2) return [set.part2.cue, ...set.part2.bullets];
    return set.part3;
  }, [set, part]);

  async function startRec() {
    setErr(null);
    setScore(null);
    setBlob(null);
    setTranscript("");
    setSeconds(0);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunks.current = [];
      mr.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      mr.onstop = () => {
        setBlob(new Blob(chunks.current, { type: mr.mimeType || "audio/webm" }));
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      recorder.current = mr;
      setRecording(true);

      const r = newRecognition();
      if (r) {
        r.onresult = (e) => {
          let out = "";
          for (let i = 0; i < e.results.length; i++) {
            const alt = e.results[i]?.[0];
            if (alt) out += alt.transcript + " ";
          }
          setTranscript(out.trim());
        };
        try { r.start(); rec.current = r; } catch { /* ignore */ }
      }
    } catch {
      setErr("Mikrofonga ruxsat berilmadi. Brauzer sozlamalarini tekshiring.");
    }
  }

  function stopRec() {
    recorder.current?.stop();
    try { rec.current?.stop(); } catch { /* ignore */ }
    rec.current = null;
    setRecording(false);
  }

  async function submit() {
    if (!set || !blob) return;
    setBusy(true);
    setErr(null);
    try {
      const buf = new Uint8Array(await blob.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i += 8192) {
        bin += String.fromCharCode(...buf.subarray(i, i + 8192));
      }
      const base64 = btoa(bin);
      const r = (await send({
        data: {
          setId: set.id,
          questions: questions.slice(0, 20),
          audio: base64,
          mimeType: blob.type || "audio/webm",
          transcriptHint: transcript || undefined,
          mockId: mock ?? null,
        },
      })) as { score: SpeakingScore };
      setScore(r.score);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen p-4 max-w-3xl mx-auto pb-16">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">🎤 IELTS Speaking</h1>
        <Link to="/ielts" className="btn-ghost text-sm">← IELTS</Link>
      </div>

      <div className="flex gap-2 mt-4">
        {[1, 2, 3].map((p) => (
          <button
            key={p}
            onClick={() => setPart(p as 1 | 2 | 3)}
            className={part === p ? "btn-primary text-sm" : "btn-ghost text-sm"}
          >
            Part {p}
          </button>
        ))}
      </div>

      {score && (
        <div className="card-surface p-4 mt-4">
          <div className="text-lg font-semibold">Band {score.overall}</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-sm">
            <M label="Fluency" v={score.fluency_coherence} />
            <M label="Lexis" v={score.lexical_resource} />
            <M label="Grammar" v={score.grammar} />
            <M label="Pronunciation" v={score.pronunciation} />
          </div>
          {!!score.transcript && (
            <details className="mt-3">
              <summary className="text-sm cursor-pointer">Transkript</summary>
              <p className="text-sm mt-1 text-muted-foreground">{score.transcript}</p>
            </details>
          )}
          {!!score.improvements.length && (
            <>
              <h3 className="font-semibold mt-3 text-sm">🎯 Yaxshilash kerak</h3>
              <ul className="list-disc pl-5 text-sm mt-1">{score.improvements.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </>
          )}
          {!!score.corrected_examples.length && (
            <div className="space-y-2 mt-3">
              {score.corrected_examples.map((c, i) => (
                <div key={i} className="text-sm rounded-lg border p-2">
                  <div className="line-through text-muted-foreground">{c.original}</div>
                  <div className="text-emerald-600">{c.corrected}</div>
                  <div className="text-xs text-muted-foreground mt-1">{c.reason}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {set && (
        <div className="card-surface p-4 mt-4">
          {part === 1 && set.part1.map((b) => (
            <div key={b.topic} className="mb-3">
              <div className="font-semibold text-sm">{b.topic}</div>
              <ul className="list-disc pl-5 text-sm mt-1">{b.questions.map((q) => <li key={q}>{q}</li>)}</ul>
            </div>
          ))}
          {part === 2 && (
            <>
              <div className="font-semibold text-sm">{set.part2.cue}</div>
              <ul className="list-disc pl-5 text-sm mt-1">{set.part2.bullets.map((q) => <li key={q}>{q}</li>)}</ul>
              <p className="text-xs text-muted-foreground mt-2">1 daqiqa tayyorgarlik, 2 daqiqa gapiring.</p>
            </>
          )}
          {part === 3 && (
            <ul className="list-disc pl-5 text-sm">{set.part3.map((q) => <li key={q}>{q}</li>)}</ul>
          )}
        </div>
      )}

      <div className="card-surface p-4 mt-4">
        {!recording ? (
          <button onClick={startRec} className="btn-primary w-full">🎙 Yozishni boshlash</button>
        ) : (
          <button onClick={stopRec} className="btn-primary w-full">
            ⏹ To'xtatish ({Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")})
          </button>
        )}
        {blob && !recording && (
          <>
            <audio className="w-full mt-3" controls src={URL.createObjectURL(blob)} />
            <button onClick={submit} disabled={busy} className="btn-primary w-full mt-3 disabled:opacity-50">
              {busy ? "AI baholamoqda..." : "Baholash"}
            </button>
          </>
        )}
        {transcript && <p className="text-xs text-muted-foreground mt-2">📝 {transcript}</p>}
      </div>

      {err && <div className="mt-3 text-sm text-red-500">{err}</div>}
    </div>
  );
}

function M({ label, v }: { label: string; v: number }) {
  return (
    <div className="rounded-lg border p-2 text-center">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold">{v}</div>
    </div>
  );
}
