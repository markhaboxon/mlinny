import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getGameState } from "@/lib/game.functions";

const LEAGUE_LABEL: Record<string, { name: string; emoji: string }> = {
  bronze: { name: "Bronza", emoji: "🥉" },
  silver: { name: "Kumush", emoji: "🥈" },
  gold: { name: "Oltin", emoji: "🥇" },
  diamond: { name: "Olmos", emoji: "💎" },
};

/** Tanga, liga, streak va muzlatkich ko'rsatkichlari + tez havolalar. */
export default function GameBar() {
  const state = useServerFn(getGameState);
  const { data } = useQuery({
    queryKey: ["game-state"],
    queryFn: () => state(),
    staleTime: 20_000,
    retry: false,
  });

  const league = LEAGUE_LABEL[data?.league ?? "bronze"] ?? LEAGUE_LABEL.bronze;

  return (
    <section className="mt-4 card-surface p-4">
      <div className="grid grid-cols-4 gap-2 text-center">
        <div>
          <div className="text-xl font-bold">🪙 {data?.coins ?? 0}</div>
          <div className="text-[11px] text-muted-foreground">Tanga</div>
        </div>
        <div>
          <div className="text-xl font-bold">🔥 {data?.streak ?? 0}</div>
          <div className="text-[11px] text-muted-foreground">Streak</div>
        </div>
        <div>
          <div className="text-xl font-bold">🧊 {data?.freezes ?? 0}</div>
          <div className="text-[11px] text-muted-foreground">Muzlatkich</div>
        </div>
        <div>
          <div className="text-xl font-bold">
            {league.emoji} {data?.weeklyXp ?? 0}
          </div>
          <div className="text-[11px] text-muted-foreground">{league.name} XP</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Link to="/shop" className="btn-ghost text-sm text-center">
          🛍️ Do'kon
        </Link>
        <Link to="/league" className="btn-ghost text-sm text-center">
          🏆 Liga
        </Link>
        <Link to="/story" className="btn-ghost text-sm text-center">
          📖 Hikoya
        </Link>
        <Link to="/duel" className="btn-ghost text-sm text-center">
          ⚔️ Duel
        </Link>
        <Link to="/review" className="btn-ghost text-sm text-center">
          🃏 Takrorlash
        </Link>
        <Link to="/pronounce" className="btn-ghost text-sm text-center">
          🎙️ Talaffuz
        </Link>
      </div>
      <Link to="/ielts" className="btn-ghost text-sm text-center mt-2 block">
        🎓 IELTS bo'limi
      </Link>
      <Link to="/write" className="btn-ghost text-sm text-center mt-2 block">
        ✍️ Insho / nutqni AI tekshiradi
      </Link>
    </section>
  );
}
