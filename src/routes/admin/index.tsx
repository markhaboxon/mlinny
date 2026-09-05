import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  adminStats,
  listAccounts,
  listActivity,
  myAccess,
  removeAccount,
  setAccountActive,
} from "@/lib/access.functions";
import { KIND_LABEL } from "@/lib/auth-config";
import { changeMyCredentials } from "@/lib/access.functions";
import {
  createLinkedAccount,
  exportAccountLinks,
  reissueAccountLinks,
} from "@/lib/onboard-links.functions";

import { setupTelegramWebhook } from "@/lib/telegram.functions";
import ApiKeysSection from "@/components/admin/ApiKeysSection";


import { copyText, fmtTime, isOnline } from "@/lib/clipboard";
import { useAuthUser } from "@/hooks/useCloudSync";
import { useRequireRole } from "@/hooks/useRequireRole";

export const Route = createFileRoute("/admin/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Admin panel — Linny" },
      { name: "description", content: "Foydalanuvchi hisoblari, kirish havolalari va faollik hisoboti." },
      { property: "og:title", content: "Admin panel — Linny" },
      { property: "og:description", content: "Hisoblar, kirish havolalari va to'liq faollik hisoboti." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPage,
});

type LinkResult = {
  id: string;
  fullName: string;
  kind?: string;
  loginUrl: string;
  parentUrl: string | null;
} | null;

function bothText(r: NonNullable<LinkResult>) {
  return (
    `${r.fullName} uchun Linny AI hisoblari tayyor:\n\n` +
    `🔵 O'quvchi uchun (o'zi kirishi uchun): ${r.loginUrl}` +
    (r.parentUrl ? `\n🟢 Ota-ona uchun (kuzatib borishi uchun): ${r.parentUrl}` : "")
  );
}

function AdminPage() {
  const user = useAuthUser();
  const guard = useRequireRole(["admin"]);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const access = useServerFn(myAccess);
  const accountsFn = useServerFn(listAccounts);
  const activityFn = useServerFn(listActivity);
  const statsFn = useServerFn(adminStats);
  const createFn = useServerFn(createLinkedAccount);
  const reissueFn = useServerFn(reissueAccountLinks);
  const exportFn = useServerFn(exportAccountLinks);
  const activeFn = useServerFn(setAccountActive);
  const removeFn = useServerFn(removeAccount);
  const credsFn = useServerFn(changeMyCredentials);
  const webhookFn = useServerFn(setupTelegramWebhook);

  const { data: me, isLoading: meLoading } = useQuery({
    queryKey: ["my-access"],
    queryFn: () => access(),
    enabled: !!user,
  });
  const isAdmin = me?.kind === "admin" && me?.active !== false;

  const { data: accounts = [] } = useQuery({
    queryKey: ["admin-accounts"],
    queryFn: () => accountsFn(),
    enabled: isAdmin,
    retry: false,
    throwOnError: false,
    refetchInterval: 30000,
  });
  const { data: activity = [] } = useQuery({
    queryKey: ["admin-activity"],
    queryFn: () => activityFn({ data: { limit: 120 } }),
    enabled: isAdmin,
    retry: false,
    throwOnError: false,
    refetchInterval: 30000,
  });
  const { data: stats } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => statsFn(),
    enabled: isAdmin,
    retry: false,
    throwOnError: false,
    refetchInterval: 30000,
  });

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [kind, setKind] = useState("student");
  const [created, setCreated] = useState<LinkResult>(null);
  const [filter, setFilter] = useState("");
  const [newLogin, setNewLogin] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const createMut = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          kind: kind as "admin" | "teacher" | "student" | "user",
        },
      }),
    onSuccess: (r) => {
      setCreated(r);
      setFirstName("");
      setLastName("");
      toast.success("Hisob yaratildi — havolalar faollashtirildi");
      qc.invalidateQueries({ queryKey: ["admin-accounts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function copyOrShow(text: string, label: string) {
    const ok = await copyText(text);
    toast[ok ? "success" : "error"](ok ? `${label} nusxalandi` : text, { duration: 15000 });
  }


  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(
      (a) =>
        a.login.toLowerCase().includes(q) ||
        (a.fullName ?? "").toLowerCase().includes(q) ||
        (KIND_LABEL[a.kind] ?? "").toLowerCase().includes(q),
    );
  }, [accounts, filter]);

  if (user === null) {
    return (
      <Shell>
        <div className="card-surface p-6 text-center">
          <p>Admin paneli uchun tizimga kiring.</p>
          <button className="btn-primary mt-4" onClick={() => navigate({ to: "/auth" })}>
            Kirish
          </button>
        </div>
      </Shell>
    );
  }

  if (meLoading) {
    return (
      <Shell>
        <p className="text-sm text-muted-foreground">Yuklanmoqda...</p>
      </Shell>
    );
  }

  if (guard.state === "loading") {
    return (
      <Shell>
        <p className="text-sm text-muted-foreground">Yuklanmoqda...</p>
      </Shell>
    );
  }

  if (!isAdmin) {
    return (
      <Shell>
        <div className="card-surface p-6 text-center">
          <div className="text-4xl">🔒</div>
          <h1 className="mt-2 font-bold">Ruxsat yo'q</h1>
          <p className="text-sm text-muted-foreground">Bu bo'lim faqat admin uchun.</p>
          <Link to="/" className="btn-primary mt-4 inline-block">
            Bosh sahifa
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Admin panel</h1>
          <p className="text-sm text-muted-foreground">Kirish hisoblari va to'liq nazorat</p>
        </div>
        <Link to="/" className="btn-ghost">
          Bosh sahifa
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Hisoblar" value={stats?.accounts ?? 0} />
        <Stat label="Hozir onlayn" value={stats?.online ?? 0} />
        <Stat label="Faol guruhlar" value={stats?.groups ?? 0} />
        <Stat label="Bugun faol" value={stats?.activeToday ?? 0} />
      </div>

      <section className="card-surface p-4">
        <h2 className="font-bold">Yangi hisob qo'shish (parolsiz)</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Login va parol kerak emas — saqlagandan keyin Telegram havolalari beriladi.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <input
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="Ism"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
          <input
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="Familiya"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
          <select
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="admin">Admin</option>
            <option value="teacher">Ustoz</option>
            <option value="student">O'quvchi</option>
            <option value="user">Foydalanuvchi</option>
          </select>
        </div>
        <button
          className="btn-primary mt-3 disabled:opacity-50"
          disabled={!firstName.trim() || !lastName.trim() || createMut.isPending}
          onClick={() => createMut.mutate()}
        >
          {createMut.isPending ? "⏳ Havolalar tayyorlanmoqda..." : "Saqlash"}
        </button>

        {created && (
          <div className="mt-4 rounded-lg border border-border p-3 text-sm space-y-3">
            <div className="font-medium">✅ {created.fullName} — havolalar faol:</div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">👤 O'zi kirishi uchun</div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono break-all text-xs">{created.loginUrl}</span>
                <button
                  className="btn-ghost text-xs"
                  onClick={() => copyOrShow(created.loginUrl, "O'quvchi havolasi")}
                >
                  Nusxalash
                </button>
              </div>
            </div>
            {created.parentUrl && (
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">👪 Ota-onasi kuzatishi uchun</div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono break-all text-xs">{created.parentUrl}</span>
                  <button
                    className="btn-ghost text-xs"
                    onClick={() => copyOrShow(created.parentUrl!, "Ota-ona havolasi")}
                  >
                    Nusxalash
                  </button>
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary" onClick={() => copyOrShow(bothText(created), "Ikkala havola")}>
                📋 Ikkalasini birga nusxalash
              </button>
              <button className="btn-ghost" onClick={() => setCreated(null)}>
                Yopish
              </button>
            </div>
          </div>
        )}
      </section>


      <section className="card-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold">Hisoblar ({accounts.length})</h2>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn-ghost text-xs"
              title="Hali botga ulanmagan barcha hisoblarning havolalari"
              onClick={async () => {
                try {
                  const r = await exportFn({ data: {} });
                  if (!r.accounts.length) return void toast.info("Ulanmagan hisob yo'q");
                  const text = r.accounts
                    .map(
                      (a) =>
                        `${a.fullName}\n🔵 O'quvchi: ${a.loginUrl}` +
                        (a.parentUrl ? `\n🟢 Ota-ona: ${a.parentUrl}` : ""),
                    )
                    .join("\n\n");
                  await copyOrShow(text, `${r.accounts.length} ta havola`);
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              📤 Barchasini eksport qilish
            </button>
            <input
              className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
              placeholder="Qidirish..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-2">Login</th>
                <th>Rol</th>
                <th>Ism</th>
                <th>Guruh</th>
                <th>Birinchi kirish</th>
                <th>Oxirgi faollik</th>
                <th>Havola</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-t border-border/60">
                  <td className="py-2 font-mono">
                    <span className={isOnline(a.lastSeenAt) ? "text-green-600 font-semibold" : ""}>
                      {isOnline(a.lastSeenAt) ? "● " : ""}
                      {a.login}
                    </span>
                  </td>
                  <td>{KIND_LABEL[a.kind] ?? a.kind}</td>
                  <td>{a.fullName ?? "—"}</td>
                  <td>{a.groupName ?? "—"}</td>
                  <td className="text-xs">{fmtTime(a.firstLoginAt)}</td>
                  <td className="text-xs">{fmtTime(a.lastSeenAt)}</td>
                  <td className="text-xs">
                    {a.link ? (a.link.used_at ? "✅ Bog'langan" : "faol havola") : "yo'q"}
                  </td>

                  <td className="whitespace-nowrap">
                    <button
                      className="btn-ghost text-xs"
                      title="Yangi Telegram havolalari (eskisi o'chadi)"
                      onClick={async () => {
                        try {
                          const r = await reissueFn({ data: { accountId: a.id } });
                          await copyOrShow(bothText(r), "Havolalar");
                          qc.invalidateQueries({ queryKey: ["admin-accounts"] });
                        } catch (e) {
                          toast.error((e as Error).message);
                        }
                      }}
                    >
                      🔗 Havolalar
                    </button>

                    <button
                      className="btn-ghost text-xs"
                      onClick={async () => {
                        await activeFn({ data: { accountId: a.id, active: !a.active } });
                        qc.invalidateQueries({ queryKey: ["admin-accounts"] });
                      }}
                    >
                      {a.active ? "Bloklash" : "Yoqish"}
                    </button>
                    <button
                      className="btn-ghost text-xs text-red-600"
                      onClick={async () => {
                        if (!confirm(`${a.login} o'chirilsinmi?`)) return;
                        try {
                          await removeFn({ data: { accountId: a.id } });
                          toast.success("O'chirildi");
                          qc.invalidateQueries({ queryKey: ["admin-accounts"] });
                        } catch (e) {
                          toast.error((e as Error).message);
                        }
                      }}
                    >
                      O'chirish
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card-surface p-4">
        <h2 className="font-bold">Admin login va parolini o'zgartirish</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Joriy login: <span className="font-mono">{me?.login ?? "—"}</span>
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <input
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="Yangi login (ixtiyoriy)"
            value={newLogin}
            onChange={(e) => setNewLogin(e.target.value)}
          />
          <input
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="Yangi parol (kamida 6 belgi)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <button
            className="btn-primary disabled:opacity-50"
            disabled={!newLogin.trim() && newPassword.length < 6}
            onClick={async () => {
              try {
                const r = await credsFn({
                  data: {
                    ...(newLogin.trim() ? { login: newLogin.trim() } : {}),
                    ...(newPassword.length >= 6 ? { password: newPassword } : {}),
                  },
                });
                setNewLogin("");
                setNewPassword("");
                toast.success(`Saqlandi. Login: ${r.login}${r.passwordChanged ? " (parol yangilandi)" : ""}`);
                qc.invalidateQueries({ queryKey: ["my-access"] });
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          >
            Saqlash
          </button>
        </div>
      </section>

      <ApiKeysSection enabled={isAdmin} />



      <section className="card-surface p-4">
        <h2 className="font-bold">Telegram bot</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Bot webhook manzilini ro'yxatdan o'tkazing — shundan keyin bot xabarlarni qabul qila boshlaydi.
        </p>
        <button
          className="btn-primary mt-3"
          onClick={async () => {
            try {
              const r = await webhookFn({ data: { origin: window.location.origin } });
              toast.success(r.ok ? `Webhook ulandi: ${r.url}` : "Webhook ulanmadi");
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
        >
          Webhook'ni ulash / yangilash
        </button>
      </section>

      <section className="card-surface p-4">
        <h2 className="font-bold">Faollik hisoboti</h2>
        <div className="mt-3 max-h-96 overflow-y-auto text-sm divide-y divide-border/60">
          {activity.map((a) => (
            <div key={a.id} className="py-2 flex justify-between gap-3">
              <span>
                <span className="font-mono">{a.login}</span> — {a.action}
                {a.detail ? <span className="text-muted-foreground"> · {a.detail}</span> : null}
              </span>
              <span className="text-xs text-muted-foreground whitespace-nowrap">{fmtTime(a.createdAt)}</span>
            </div>
          ))}
          {activity.length === 0 && (
            <p className="text-sm text-muted-foreground py-2">Hozircha yozuv yo'q.</p>
          )}
        </div>
      </section>
    </Shell>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card-surface p-4 text-center">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-5">{children}</div>
    </div>
  );
}
