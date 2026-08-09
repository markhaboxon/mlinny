import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { buyShopItem, equipShopItem, listShop } from "@/lib/game.functions";
import { useRequireRole } from "@/hooks/useRequireRole";

export const Route = createFileRoute("/shop")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Do'kon — Linny" },
      { name: "description", content: "Tangalarni streak muzlatkich, avatar va mavzularga almashtiring." },
      { property: "og:title", content: "Do'kon — Linny" },
      { property: "og:description", content: "Tangalaringizni foydali narsalarga sarflang." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ShopPage,
});

function ShopPage() {
  const { state } = useRequireRole(["student", "user", "teacher", "admin"]);
  const ready = state === "ok";
  const load = useServerFn(listShop);
  const buy = useServerFn(buyShopItem);
  const equip = useServerFn(equipShopItem);
  const qc = useQueryClient();
  const [msg, setMsg] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["shop"],
    queryFn: () => load(),
    enabled: ready,
    retry: false,
  });

  async function act(kind: "buy" | "equip", code: string) {
    setMsg(null);
    const res = kind === "buy" ? await buy({ data: { code } }) : await equip({ data: { code } });
    setMsg(res.ok ? (kind === "buy" ? "Sotib olindi ✅" : "Tanlandi ✅") : (res.error ?? "Xatolik"));
    qc.invalidateQueries({ queryKey: ["shop"] });
    qc.invalidateQueries({ queryKey: ["game-state"] });
  }

  if (!ready) return <div className="p-8 text-center text-muted-foreground">Yuklanmoqda...</div>;

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-3xl mx-auto">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">🛍️ Do'kon</h1>
        <Link to="/" className="btn-ghost text-sm">
          ← Panel
        </Link>
      </header>

      <div className="mt-3 card-surface p-4 flex items-center justify-between">
        <div className="text-lg font-bold">🪙 {data?.state.coins ?? 0} tanga</div>
        <div className="text-sm text-muted-foreground">🧊 {data?.state.freezes ?? 0} muzlatkich</div>
      </div>

      {msg && <div className="mt-3 text-sm text-center text-primary">{msg}</div>}
      {isLoading && <p className="mt-6 text-center text-muted-foreground">Yuklanmoqda...</p>}

      <div className="mt-4 grid sm:grid-cols-2 gap-3">
        {(data?.items ?? []).map((it) => {
          const affordable = (data?.state.coins ?? 0) >= it.price;
          return (
            <div key={it.code} className="card-surface p-4 flex flex-col">
              <div className="text-2xl">{it.emoji ?? "🎁"}</div>
              <div className="mt-1 font-semibold">{it.title}</div>
              {it.description && (
                <p className="text-sm text-muted-foreground mt-1 flex-1">{it.description}</p>
              )}
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="text-sm font-medium">🪙 {it.price}</span>
                {it.equipped ? (
                  <span className="text-xs px-3 py-1 rounded-full bg-primary/10 text-primary">Tanlangan</span>
                ) : it.owned ? (
                  <button className="btn-ghost text-sm" onClick={() => act("equip", it.code)}>
                    Tanlash
                  </button>
                ) : (
                  <button
                    className="btn-primary text-sm disabled:opacity-40"
                    disabled={!affordable}
                    onClick={() => act("buy", it.code)}
                  >
                    Sotib olish
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
