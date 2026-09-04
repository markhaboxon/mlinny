import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { addCard, getDueCards, reviewCard, type SrsCard } from "@/lib/srs.functions";
import { useRequireRole } from "@/hooks/useRequireRole";

export const Route = createFileRoute("/review")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Aqlli takrorlash (SRS) — Linny" },
      {
        name: "description",
        content:
          "Spaced repetition tizimi: o'rgangan so'zlaringizni aynan unutish arafasida takrorlab, uzoq muddatli xotiraga o'tkazing.",
      },
      { property: "og:title", content: "Aqlli takrorlash (SRS) — Linny" },
      { property: "og:description", content: "So'zlarni ilmiy interval bo'yicha takrorlash." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReviewPage,
});

const GRADES: { q: number; label: string; hint: string; cls: string }[] = [
  { q: 1, label: "Bilmadim", hint: "ertaga qayta", cls: "bg-red-500/10 border-red-500/40" },
  { q: 3, label: "Qiyin", hint: "tez orada", cls: "bg-amber-500/10 border-amber-500/40" },
  { q: 4, label: "Bildim", hint: "keyingi interval", cls: "bg-emerald-500/10 border-emerald-500/40" },
  { q: 5, label: "Juda oson", hint: "uzoq muddat", cls: "bg-sky-500/10 border-sky-500/40" },
];

function ReviewPage() {
  const { state } = useRequireRole(["student", "user", "teacher", "admin"]);
  const ready = state === "ok";
  const due = useServerFn(getDueCards);
  const review = useServerFn(reviewCard);
  const add = useServerFn(addCard);

  const [queue, setQueue] = useState<SrsCard[]>([]);
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [last, setLast] = useState<string | null>(null);
  const [newWord, setNewWord] = useState("");
  const [newTr, setNewTr] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["srs-due"],
    queryFn: () => due({ data: { limit: 20 } }),
    enabled: ready,
    retry: false,
  });

  useEffect(() => {
    if (data?.cards) {
      setQueue(data.cards);
      setI(0);
      setFlipped(false);
    }
  }, [data]);

  const card = queue[i];
  const progress = useMemo(
    () => (queue.length ? Math.round((i / queue.length) * 100) : 0),
    [i, queue.length],
  );

  async function grade(q: number) {
    if (!card || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await review({ data: { id: card.id, quality: q } });
      setDoneCount((n) => n + 1);
      setLast(r.dueDate ? `Keyingi takror: ${r.dueDate} (${r.interval} kun)` : null);
      setFlipped(false);
      setI((n) => n + 1);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Xatolik");
    } finally {
      setBusy(false);
    }
  }

  function speak(text: string) {
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US";
      window.speechSynthesis.speak(u);
    } catch {
      /* ovoz bo'lmasa jim o'tamiz */
    }
  }

  async function addNew() {
    if (newWord.trim().length < 1) return;
    setBusy(true);
    try {
      await add({ data: { word: newWord.trim(), translation: newTr.trim() || undefined } });
      setNewWord("");
      setNewTr("");
      await refetch();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Qo'shib bo'lmadi");
    } finally {
      setBusy(false);
    }
  }

  if (!ready || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="card-surface p-8">🧠 Takrorlash tayyorlanmoqda...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <Link to="/" className="btn-ghost text-sm">← Panelga</Link>
        <div className="text-xs text-muted-foreground">
          Bugun takrorlangan: {(data?.stats.reviewedToday ?? 0) + doneCount}
        </div>
      </div>

      <h1 className="mt-6 text-2xl md:text-3xl font-bold">Aqlli takrorlash 🧠</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        So'zlar aynan unutish arafasida qaytadi — shu tarzda uzoq muddatli xotiraga o'tadi.
      </p>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="card-surface p-3">
          <div className="text-xl font-bold">{data?.stats.total ?? 0}</div>
          <div className="text-[11px] text-muted-foreground">Jami karta</div>
        </div>
        <div className="card-surface p-3">
          <div className="text-xl font-bold">{Math.max(0, queue.length - i)}</div>
          <div className="text-[11px] text-muted-foreground">Navbatda</div>
        </div>
        <div className="card-surface p-3">
          <div className="text-xl font-bold">{data?.stats.learned ?? 0}</div>
          <div className="text-[11px] text-muted-foreground">Mustahkam</div>
        </div>
      </div>

      {err && <div className="mt-3 text-sm text-red-500">{err}</div>}

      {card ? (
        <>
          <div className="mt-4 h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>

          <div
            onClick={() => setFlipped((v) => !v)}
            className="mt-4 card-surface p-8 text-center cursor-pointer select-none min-h-[220px] flex flex-col items-center justify-center"
          >
            {!flipped ? (
              <>
                <div className="text-3xl md:text-4xl font-bold">{card.word}</div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    speak(card.word);
                  }}
                  className="mt-3 btn-ghost text-sm"
                >
                  🔊 Tinglash
                </button>
                <div className="mt-3 text-xs uppercase text-muted-foreground">Bosing — javob</div>
              </>
            ) : (
              <>
                <div className="text-2xl font-bold">{card.translation ?? "—"}</div>
                {card.example && <div className="mt-3 italic text-sm">"{card.example}"</div>}
                <div className="mt-3 text-xs text-muted-foreground">
                  Takrorlar: {card.reps} · interval {card.interval} kun
                </div>
              </>
            )}
          </div>

          {flipped && (
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
              {GRADES.map((g) => (
                <button
                  key={g.q}
                  disabled={busy}
                  onClick={() => grade(g.q)}
                  className={`rounded-2xl border p-3 text-sm disabled:opacity-40 ${g.cls}`}
                >
                  <div className="font-semibold">{g.label}</div>
                  <div className="text-[11px] text-muted-foreground">{g.hint}</div>
                </button>
              ))}
            </div>
          )}
          {last && <div className="mt-3 text-xs text-muted-foreground text-center">{last}</div>}
        </>
      ) : (
        <div className="mt-6 card-surface p-8 text-center">
          <div className="text-5xl">🎉</div>
          <div className="mt-2 font-semibold">Bugungi takrorlash tugadi!</div>
          <p className="text-sm text-muted-foreground mt-1">
            {doneCount > 0 ? `${doneCount} ta karta takrorlandi.` : "Hozircha muddati kelgan karta yo'q."}
          </p>
          <button onClick={() => refetch()} className="btn-ghost mt-4 text-sm">Yangilash</button>
        </div>
      )}

      <div className="mt-8 card-surface p-4">
        <div className="font-semibold text-sm">➕ O'z so'zingizni qo'shish</div>
        <div className="mt-3 grid sm:grid-cols-3 gap-2">
          <input
            value={newWord}
            onChange={(e) => setNewWord(e.target.value)}
            placeholder="word"
            className="rounded-2xl border p-3 bg-background"
          />
          <input
            value={newTr}
            onChange={(e) => setNewTr(e.target.value)}
            placeholder="tarjima"
            className="rounded-2xl border p-3 bg-background"
          />
          <button onClick={addNew} disabled={busy || !newWord.trim()} className="btn-primary disabled:opacity-40">
            Qo'shish
          </button>
        </div>
      </div>
    </div>
  );
}
