import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getIeltsHome, saveIeltsSettings } from "@/lib/ielts.functions";
import { SKILL_LABEL } from "@/lib/ielts-types";

export const Route = createFileRoute("/ielts")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "IELTS mashqlari — Linny" },
      {
        name: "description",
        content:
          "Listening, Reading, Writing va Speaking — real IELTS formatida mashq qiling, AI band score bilan baholaydi.",
      },
      { property: "og:title", content: "IELTS mashqlari — Linny" },
      {
        property: "og:description",
        content: "4 ko'nikma bo'yicha IELTS mashqlari va AI baholash.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: IeltsHome,
});

function IeltsHome() {
  const qc = useQueryClient();
  const home = useServerFn(getIeltsHome);
  const save = useServerFn(saveIeltsSettings);
  const { data, isLoading } = useQuery({
    queryKey: ["ielts-home"],
    queryFn: () => home(),
    retry: false,
  });
  const mutate = useMutation({
    mutationFn: (input: { variant?: "academic" | "general"; targetBand?: number | null }) =>
      save({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ielts-home"] }),
  });

  return (
    <div className="min-h-screen p-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">🎓 IELTS</h1>
        <Link to="/" className="btn-ghost text-sm">
          ← Orqaga
        </Link>
      </div>

      <section className="card-surface p-4 mt-4">
        <h2 className="font-semibold">Imtihon turi</h2>
        <div className="mt-2 flex gap-2">
          {(["academic", "general"] as const).map((v) => (
            <button
              key={v}
              onClick={() => mutate.mutate({ variant: v })}
              className={data?.variant === v ? "btn-primary text-sm" : "btn-ghost text-sm"}
            >
              {v === "academic" ? "Academic" : "General Training"}
            </button>
          ))}
        </div>
        <label className="block mt-4 text-sm">
          Maqsad band score
          <input
            type="number"
            min={1}
            max={9}
            step={0.5}
            defaultValue={data?.target ?? undefined}
            onBlur={(e) =>
              mutate.mutate({ targetBand: e.target.value ? Number(e.target.value) : null })
            }
            className="mt-1 w-28 rounded-lg border bg-background px-3 py-2"
          />
        </label>
        <p className="mt-2 text-sm text-muted-foreground">
          Joriy umumiy band: <b>{data?.current || "—"}</b>
          {data?.target ? ` • Maqsad: ${data.target}` : ""}
        </p>
      </section>

      <section className="grid grid-cols-2 gap-3 mt-4">
        {([
          ["listening", "/ielts/listening", "🎧"],
          ["reading", "/ielts/reading", "📖"],
          ["writing", "/ielts/writing", "✍️"],
          ["speaking", "/ielts/speaking", "🎤"],
        ] as const).map(([s, to, icon]) => (
          <Link key={s} to={to} className="card-surface p-4 block hover:opacity-90">
            <div className="font-semibold">
              {icon} {SKILL_LABEL[s]}
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              Eng yaxshi band: {data?.best?.[s] ?? "—"}
            </div>
            <div className="text-xs text-primary mt-2">Mashqni boshlash →</div>
          </Link>
        ))}
      </section>

      <Link to="/ielts/mock" className="btn-primary w-full mt-4 block text-center">
        🏁 To'liq mock test
      </Link>


      <section className="card-surface p-4 mt-4">
        <h2 className="font-semibold">Natijalar tarixi</h2>
        {isLoading && <p className="text-sm text-muted-foreground mt-2">Yuklanmoqda...</p>}
        {!isLoading && !data?.attempts.length && (
          <p className="text-sm text-muted-foreground mt-2">Hali test topshirilmagan.</p>
        )}
        <ul className="mt-2 space-y-1 text-sm">
          {(data?.attempts ?? []).slice(0, 15).map((a) => (
            <li key={a.id} className="flex justify-between border-b border-border/50 py-1">
              <span>{SKILL_LABEL[a.skill as keyof typeof SKILL_LABEL] ?? a.skill}</span>
              <span>
                {a.band ?? "—"}
                {a.total ? ` (${a.raw}/${a.total})` : ""} •{" "}
                {new Date(a.createdAt).toLocaleDateString("uz-UZ")}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {!!data?.weakness.length && (
        <section className="card-surface p-4 mt-4">
          <h2 className="font-semibold">Eng ko'p takrorlanadigan kamchiliklar</h2>
          <ul className="mt-2 list-disc pl-5 text-sm space-y-1">
            {data.weakness.map((w) => (
              <li key={w.text}>
                {w.text} <span className="text-muted-foreground">×{w.count}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
