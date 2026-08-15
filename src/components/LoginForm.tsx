import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { heartbeat } from "@/lib/access.functions";
import {
  pollTgLogin,
  registerDevice,
  requestTgCode,
  requestTgLogin,
  verifyTgCode,
} from "@/lib/tg-auth.functions";
import { ADMIN_CONTACT, emailOf } from "@/lib/auth-config";
import { deviceFingerprint, deviceLabel } from "@/lib/device";

type Phase = "idle" | "waiting" | "code" | "signing";

/** Kirish oynasi: Telegram tasdiqlash yoki 8 xonali kod; zaxira — login/parol. */
export default function LoginForm({ onDone }: { onDone?: () => void }) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [showPw, setShowPw] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const ping = useServerFn(heartbeat);
  const requestFn = useServerFn(requestTgLogin);
  const pollFn = useServerFn(pollTgLogin);
  const codeRequestFn = useServerFn(requestTgCode);
  const codeVerifyFn = useServerFn(verifyTgCode);
  const deviceFn = useServerFn(registerDevice);

  useEffect(() => () => void (timer.current && clearInterval(timer.current)), []);

  function stopTimer() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }

  async function afterAuth() {
    try {
      await ping({ data: { first: true, action: "kirdi" } });
    } catch {
      /* ignore */
    }
    try {
      const r = await deviceFn({
        data: { fingerprint: deviceFingerprint(), label: deviceLabel() },
      });
      if (r?.revoked) {
        await supabase.auth.signOut();
        setErr("Bu qurilma Telegramda rad etilgan. Admin bilan bog'laning.");
        setPhase("idle");
        setBusy(false);
        return;
      }
    } catch {
      /* ignore */
    }
    if (onDone) onDone();
    else window.location.replace("/");
  }

  async function signIn(email: string, pw: string) {
    setPhase("signing");
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
    if (error) {
      setErr("Kirishda xatolik. Admin bilan bog'laning.");
      setPhase("idle");
      setBusy(false);
      return;
    }
    await afterAuth();
  }

  async function tgLogin() {
    setErr(null);
    setBusy(true);
    try {
      const { requestId } = await requestFn({
        data: { login: login.trim(), device: deviceLabel() },
      });
      setPhase("waiting");
      setSeconds(120);
      stopTimer();
      timer.current = setInterval(async () => {
        setSeconds((s) => (s > 0 ? s - 1 : 0));
        try {
          const r = await pollFn({ data: { requestId } });
          if (r.status === "ok") {
            stopTimer();
            await signIn(r.email, r.password);
          } else if (r.status === "denied") {
            stopTimer();
            setErr("So'rov Telegramda rad etildi.");
            setPhase("idle");
            setBusy(false);
          } else if (r.status === "expired" || r.status === "not_found") {
            stopTimer();
            setErr("So'rov muddati tugadi. Qaytadan urinib ko'ring.");
            setPhase("idle");
            setBusy(false);
          }
        } catch {
          /* ignore */
        }
      }, 2000);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
      setPhase("idle");
    }
  }

  async function askCode() {
    setErr(null);
    setBusy(true);
    try {
      await codeRequestFn({ data: { login: login.trim() } });
      setCode("");
      setPhase("code");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const r = await codeVerifyFn({ data: { login: login.trim(), code: code.trim() } });
      await signIn(r.email, r.password);
    } catch (e2) {
      setErr((e2 as Error).message);
      setBusy(false);
    }
  }

  async function pwSubmit(e: React.FormEvent) {
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
    await afterAuth();
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
            Loginingizni yozing — tasdiqlash Telegram orqali bo'ladi. Parol kerak emas.
          </p>
        </div>

        {phase === "waiting" || phase === "signing" ? (
          <div className="mt-6 text-center space-y-3">
            <div className="text-4xl">📲</div>
            <p className="text-sm">
              {phase === "signing"
                ? "Kirilmoqda..."
                : "Telegramda \"✅ Ha, bu men\" tugmasini bosing."}
            </p>
            {phase === "waiting" && (
              <p className="text-xs text-muted-foreground">Qolgan vaqt: {seconds} soniya</p>
            )}
            <button
              className="btn-ghost text-sm"
              onClick={() => {
                stopTimer();
                setPhase("idle");
                setBusy(false);
              }}
            >
              Bekor qilish
            </button>
          </div>
        ) : phase === "code" ? (
          <form onSubmit={submitCode} className="mt-6 space-y-3 text-center">
            <div className="text-4xl">🔢</div>
            <p className="text-sm">Telegramga yuborilgan 8 xonali kodni kiriting.</p>
            <input
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-center text-lg tracking-[0.35em]"
              placeholder="••••••••"
              inputMode="numeric"
              maxLength={8}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
            />
            <button
              type="submit"
              disabled={busy || code.length !== 8}
              className="btn-primary w-full disabled:opacity-50"
            >
              {busy ? "Tekshirilmoqda..." : "Tasdiqlash"}
            </button>
            <button
              type="button"
              className="btn-ghost text-xs"
              onClick={() => {
                setPhase("idle");
                setBusy(false);
              }}
            >
              Orqaga
            </button>
          </form>
        ) : (
          <div className="mt-6 space-y-3">
            <input
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              placeholder="Login"
              autoComplete="username"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
            />
            <button
              type="button"
              onClick={tgLogin}
              disabled={busy || login.trim().length < 3}
              className="btn-primary w-full disabled:opacity-50"
            >
              {busy ? "Yuborilmoqda..." : "📲 Kirish so'rovi yuborish"}
            </button>
            <button
              type="button"
              onClick={askCode}
              disabled={busy || login.trim().length < 3}
              className="btn-ghost w-full text-sm disabled:opacity-50"
            >
              🔢 Telegram orqali kod olish
            </button>

            <button
              type="button"
              className="btn-ghost w-full text-xs"
              onClick={() => setShowPw((v) => !v)}
            >
              {showPw ? "Yashirish" : "Faqat admin: parol bilan kirish"}
            </button>

            {showPw && (
              <form onSubmit={pwSubmit} className="space-y-3">
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
            )}
          </div>
        )}

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
