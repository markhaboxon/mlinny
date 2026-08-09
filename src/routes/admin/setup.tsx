import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { adminExists, bootstrapAdmin } from "@/lib/access.functions";

export const Route = createFileRoute("/admin/setup")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Admin sozlash — Linny" },
      { name: "description", content: "Tizimning birinchi admin hisobini yarating." },
      { property: "og:title", content: "Admin sozlash — Linny" },
      { property: "og:description", content: "Tizimning birinchi admin hisobini yarating." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SetupPage,
});

function SetupPage() {
  const exists = useServerFn(adminExists);
  const create = useServerFn(bootstrapAdmin);
  const { data, isLoading, refetch } = useQuery({ queryKey: ["admin-exists"], queryFn: () => exists() });

  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [setupSecret, setSetupSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await create({ data: { login: login.trim(), password, setupSecret: setupSecret.trim() } });
      setDone(true);
      refetch();
    } catch (e2) {
      setErr((e2 as Error).message);
    }
    setBusy(false);
  }


  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="card-surface max-w-md w-full p-8">
        <h1 className="text-xl font-bold text-center">Birinchi admin</h1>
        {isLoading && <p className="mt-4 text-sm text-muted-foreground text-center">Tekshirilmoqda...</p>}

        {!isLoading && (data?.exists || done) && (
          <div className="mt-4 text-center">
            <p className="text-sm text-muted-foreground">
              {done ? "Admin yaratildi. Endi login va parol bilan kiring." : "Admin allaqachon mavjud."}
            </p>
            <Link to="/auth" className="btn-primary mt-4 inline-block">
              Kirish
            </Link>
          </div>
        )}

        {!isLoading && !data?.exists && !done && (
          <form onSubmit={submit} className="mt-6 space-y-3">
            <p className="text-sm text-muted-foreground">
              Bu sahifa faqat bir marta ishlaydi va sozlash kalitini talab qiladi.
            </p>
            <input
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              placeholder="Admin login"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
            />
            <input
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              placeholder="Parol (kamida 8 belgi)"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <input
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              placeholder="Sozlash kaliti (ADMIN_SETUP_SECRET)"
              type="password"
              autoComplete="off"
              value={setupSecret}
              onChange={(e) => setSetupSecret(e.target.value)}
            />
            <button
              className="btn-primary w-full disabled:opacity-50"
              disabled={
                busy || login.trim().length < 3 || password.length < 8 || setupSecret.trim().length < 8
              }
            >
              {busy ? "Yaratilmoqda..." : "Admin yaratish"}
            </button>

            {err && <div className="text-sm text-red-500">{err}</div>}
          </form>
        )}
      </div>
    </div>
  );
}
