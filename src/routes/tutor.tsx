import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { tutorReply, TUTOR_ROLES, type TutorTurn } from "@/lib/practice.functions";
import { useRequireRole } from "@/hooks/useRequireRole";
import { loadProfile } from "@/lib/profile";

export const Route = createFileRoute("/tutor")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "AI suhbatdosh ustoz — Linny" },
      {
        name: "description",
        content:
          "Kafeda, ish suhbatida yoki aeroportda ingliz tilida gaplashing — AI javob beradi, xatolaringizni tuzatadi va tarjima qiladi.",
      },
      { property: "og:title", content: "AI suhbatdosh ustoz — Linny" },
      { property: "og:description", content: "Jonli suhbat mashqi: xato tuzatish, tarjima va javob variantlari." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TutorPage,
});

type Msg = { who: "me" | "ai"; text: string; turn?: TutorTurn };

function speak(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  window.speechSynthesis.speak(u);
}

function TutorPage() {
  const { state } = useRequireRole(["student", "user", "teacher", "admin"]);
  const ready = state === "ok";
  const reply = useServerFn(tutorReply);
  const level = (loadProfile().levelChosen ?? "orta") as "past" | "orta" | "yaxshi";

  const [role, setRole] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function send(text: string, history: Msg[]) {
    setBusy(true);
    setErr(null);
    try {
      const turn = (await reply({
        data: {
          role: role ?? "friend",
          level,
          history: history.slice(-12).map((m) => ({ who: m.who, text: m.text })),
          message: text,
        },
      })) as TutorTurn;
      setMsgs((m) => [...m, { who: "ai", text: turn.reply, turn }]);
      speak(turn.reply);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Javob olinmadi.");
    } finally {
      setBusy(false);
    }
  }

  async function start(code: string) {
    setRole(code);
    setMsgs([]);
    setInput("");
    setBusy(true);
    setErr(null);
    try {
      const turn = (await reply({ data: { role: code, level, history: [], message: "" } })) as TutorTurn;
      setMsgs([{ who: "ai", text: turn.reply, turn }]);
      speak(turn.reply);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Suhbatni boshlab bo'lmadi.");
    } finally {
      setBusy(false);
    }
  }

  function submit(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    const next: Msg[] = [...msgs, { who: "me", text: t }];
    setMsgs(next);
    setInput("");
    void send(t, next);
  }

  const last = [...msgs].reverse().find((m) => m.who === "ai")?.turn ?? null;

  return (
    <main className="mx-auto max-w-2xl p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">💬 AI suhbatdosh</h1>
        <Link to="/" className="btn-ghost text-sm">
          ← Bosh sahifa
        </Link>
      </div>

      {!role ? (
        <>
          <p className="text-sm text-muted-foreground mt-1">Vaziyatni tanlang va ingliz tilida gaplashing.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {TUTOR_ROLES.map((r) => (
              <button
                key={r.code}
                disabled={!ready}
                className="card-surface p-3 text-left hover:opacity-90"
                onClick={() => void start(r.code)}
              >
                <div className="font-semibold">
                  {r.emoji} {r.title}
                </div>
                <div className="text-xs text-muted-foreground">{r.brief}</div>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <button className="btn-ghost text-sm mt-3" onClick={() => setRole(null)}>
            ← Vaziyatlar
          </button>

          <section className="card-surface p-4 mt-3 space-y-3">
            {msgs.map((m, i) => (
              <div key={i} className={m.who === "me" ? "text-right" : ""}>
                <div
                  className={`inline-block max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                    m.who === "me" ? "bg-primary text-primary-foreground" : "bg-muted"
                  }`}
                >
                  {m.text}
                </div>
                {m.turn?.translation && (
                  <div className="text-xs text-muted-foreground mt-1">{m.turn.translation}</div>
                )}
                {m.who === "ai" && (
                  <button className="text-xs text-muted-foreground underline ml-1" onClick={() => speak(m.text)}>
                    🔊
                  </button>
                )}
              </div>
            ))}
            {busy && <p className="text-sm text-muted-foreground">…</p>}
            {err && <p className="text-sm text-red-600/80">{err}</p>}
          </section>

          {last?.correction && (
            <div className="card-surface p-3 mt-3 text-sm">
              <div>
                ✍️ To'g'rirog'i: <span className="font-semibold text-emerald-600">{last.correction}</span>
              </div>
              {last.tip && <div className="text-muted-foreground mt-1">{last.tip}</div>}
            </div>
          )}

          {last?.suggestions?.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {last.suggestions.map((s, i) => (
                <button key={i} className="btn-ghost text-xs" disabled={busy} onClick={() => submit(s)}>
                  {s}
                </button>
              ))}
            </div>
          ) : null}

          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              submit(input);
            }}
          >
            <input
              className="flex-1 rounded-xl border border-border bg-background p-3 text-base"
              placeholder="Type in English…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button className="btn-primary" disabled={busy || !input.trim()}>
              ➤
            </button>
          </form>
        </>
      )}
    </main>
  );
}
