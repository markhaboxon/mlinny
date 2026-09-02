import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { startMock, getMockState, finishMock } from "@/lib/ielts.functions";
import { SKILL_LABEL } from "@/lib/ielts-types";

export const Route = createFileRoute("/ielts_/mock")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "IELTS to'liq mock test — Linny" },
      {
        name: "description",
        content: "4 ta ko'nikma bo'yicha to'liq IELTS mock test va umumiy overall band hisobi.",
      },
      { property: "og:title", content: "IELTS to'liq mock test — Linny" },
      { property: "og:description", content: "Listening, Reading, Writing va Speaking — bitta mock testda." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MockPage,
});

const KEY = "linny_ielts_mock_id";
const SKILLS = ["listening", "reading", "writing", "speaking"] as const;

function MockPage() {
  const start = useServerFn(startMock);
  const state = useServerFn(getMockState);
  const finish = useServerFn(finishMock);

  const [mockId, setMockId] = useState<string | null>(null);
  const [parts, setParts] = useState<{ skill: string; band: number | null }[]>([]);
  const [overall, setOverall] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(KEY);
    if (saved) {
      setMockId(saved);
      void refresh(saved);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function refresh(id: string) {
    try {
      const s = (await state({ data: { mockId: id } })) as { parts: { skill: string; band: number | null }[] };
      setParts(s.parts);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function begin() {
    setBusy(true);
    setErr(null);
    try {
      const r = (await start()) as { mockId: string };
      localStorage.setItem(KEY, r.mockId);
      setMockId(r.mockId);
      setParts([]);
      setOverall(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function complete() {
    if (!mockId) return;
    setBusy(true);
    setErr(null);
    try {
      const r = (await finish({ data: { mockId } })) as { overall: number };
      setOverall(r.overall);
      localStorage.removeItem(KEY);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const done = new Map(parts.map((p) => [p.skill, p.band]));

  return (
    <div className="min-h-screen p-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">🏁 To'liq mock test</h1>
        <Link to="/ielts" className="btn-ghost text-sm">← IELTS</Link>
      </div>

      {!mockId ? (
        <div className="card-surface p-4 mt-4">
          <p className="text-sm text-muted-foreground">
            To'rt bo'limni ketma-ket topshiring — natijalar bitta mock testga yig'iladi va
            overall band hisoblanadi.
          </p>
          <button onClick={begin} disabled={busy} className="btn-primary w-full mt-3 disabled:opacity-50">
            {busy ? "..." : "Mock testni boshlash"}
          </button>
        </div>
      ) : (
        <div className="card-surface p-4 mt-4 space-y-2">
          {SKILLS.map((s) => {
            const band = done.get(s);
            return (
              <div key={s} className="flex items-center gap-3 rounded-xl border p-3">
                <span className="text-sm font-medium flex-1">{SKILL_LABEL[s]}</span>
                {band !== undefined ? (
                  <span className="text-sm text-emerald-600">Band {band ?? "—"}</span>
                ) : (
                  <Link
                    to={`/ielts/${s}` as "/ielts/listening"}
                    search={{ mock: mockId }}
                    className="btn-primary text-sm"
                  >
                    Boshlash
                  </Link>
                )}
              </div>
            );
          })}
          <div className="flex gap-2 pt-2">
            <button onClick={() => refresh(mockId)} className="btn-ghost text-sm">🔄 Yangilash</button>
            <button onClick={complete} disabled={busy || !parts.length} className="btn-primary text-sm ml-auto disabled:opacity-50">
              Yakunlash
            </button>
          </div>
          {overall !== null && (
            <div className="text-lg font-semibold pt-2">Overall band: {overall}</div>
          )}
        </div>
      )}
      {err && <div className="mt-3 text-sm text-red-500">{err}</div>}
    </div>
  );
}
