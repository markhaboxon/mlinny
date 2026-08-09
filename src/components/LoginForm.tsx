import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { heartbeat } from "@/lib/access.functions";
import { ADMIN_CONTACT, emailOf } from "@/lib/auth-config";

/** Login + parol kirish oynasi. Hisoblarni admin (yoki ustoz) yaratadi. */
export default function LoginForm({ onDone }: { onDone?: () => void }) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ping = useServerFn(heartbeat);


  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: emailOf(login),
      password,
    });
    if (error) {
      setErr("Login yoki parol noto'g'ri. Admin bilan bog'laning.");
      setBusy(false);
      return;
    }
    try {
      await ping({ data: { first: true, action: "kirdi" } });
    } catch {
      /* ignore */
    }
    if (onDone) onDone();
    else window.location.replace("/");
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="card-surface max-w-md w-full p-8">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto rounded-full gradient-brand flex items-center justify-center text-3xl">
            🦉
          </div>
          <h1 className="mt-4 text-2xl font-bold">Linny ga kirish</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Login va parolni admin yoki ustozingiz beradi.
          </p>
        </div>

        <form onSubmit={submit} className="mt-6 space-y-3">
          <input
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="Login"
            autoComplete="username"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
          />
          <input
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="Parol"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="submit"
            disabled={busy || login.trim().length < 3 || password.length < 4}
            className="btn-primary w-full disabled:opacity-50"
          >
            {busy ? "Kirilmoqda..." : "Kirish"}
          </button>
        </form>

        {err && <div className="mt-3 text-sm text-red-500 text-center">{err}</div>}

        <div className="mt-6 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground text-center">
          Xatolik bo'lsa admin bilan bog'laning:
          <br />
          Telegram: <span className="font-medium">@{ADMIN_CONTACT.telegram}</span>
          <br />
          Email: <span className="font-medium">{ADMIN_CONTACT.email}</span>
        </div>
      </div>
    </div>
  );
}
