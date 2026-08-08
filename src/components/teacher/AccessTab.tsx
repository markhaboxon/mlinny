import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  addStudentLogins,
  groupAccounts,
  issueLink,
  moveStudentAccount,
  removeStudentAccount,
  resetAccountPasswordFn,
} from "@/lib/access.functions";
import { copyText, fmtTime, isOnline, linkFor } from "@/lib/clipboard";
import type { GroupOverview } from "@/lib/teacher-ui";

/** Guruhning kirish loginlari: yaratish, nusxalash, yangilash, ko'chirish. */
export default function AccessTab({
  groupId,
  groups,
}: {
  groupId: string;
  groups: GroupOverview[];
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(groupAccounts);
  const addFn = useServerFn(addStudentLogins);
  const linkFn = useServerFn(issueLink);
  const moveFn = useServerFn(moveStudentAccount);
  const removeFn = useServerFn(removeStudentAccount);
  const resetPwFn = useServerFn(resetAccountPasswordFn);
  const [count, setCount] = useState(1);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["group-accounts", groupId],
    queryFn: () => listFn({ data: { groupId } }),
    refetchInterval: 30000,
  });

  const addMut = useMutation({
    mutationFn: () => addFn({ data: { groupId, count } }),
    onSuccess: () => {
      toast.success("Yangi loginlar yaratildi");
      qc.invalidateQueries({ queryKey: ["group-accounts", groupId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function copyOne(accountId: string, token?: string | null, used?: boolean) {
    const t = token && !used ? token : (await linkFn({ data: { accountId } })).token;
    const ok = await copyText(linkFor(t));
    if (ok) toast.success("Link nusxalandi");
    else toast.error("Nusxalab bo'lmadi");
    qc.invalidateQueries({ queryKey: ["group-accounts", groupId] });
  }

  async function copyAll() {
    const lines: string[] = [];
    for (const r of rows) {
      const t = r.link && !r.link.used_at ? r.link.token : (await linkFn({ data: { accountId: r.id } })).token;
      lines.push(`${r.login}\n${linkFor(t)}`);
    }
    const ok = await copyText(lines.join("\n\n"));
    if (ok) toast.success("Barcha havolalar nusxalandi");
    else toast.error("Nusxalab bo'lmadi");
    qc.invalidateQueries({ queryKey: ["group-accounts", groupId] });
  }

  const otherGroups = groups.filter((g) => g.group_id !== groupId);

  return (
    <div className="space-y-4">
      <div className="card-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold">Kirish loginlari ({rows.length})</h3>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="number"
              min={1}
              max={20}
              value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
              className="w-20 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            />
            <button className="btn-ghost" disabled={addMut.isPending} onClick={() => addMut.mutate()}>
              + Login qo'shish
            </button>
            <button className="btn-primary" onClick={copyAll} disabled={rows.length === 0}>
              Hammasini nusxalash
            </button>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Har bir havola faqat bir marta ishlaydi — bitta login bilan faqat bitta o'quvchi kiradi.
          Parollar saqlanmaydi: kerak bo'lsa "Yangi parol" orqali bir martalik yangi parol oling.
        </p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Yuklanmoqda...</p>}

      <div className="card-surface p-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-2">Login</th>
              <th>Ism</th>
              <th>Holat</th>
              <th>Birinchi kirish</th>
              <th>Oxirgi faollik</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border/60">
                <td className="py-2 font-mono">
                  {isOnline(r.lastSeenAt) ? <span className="text-green-600">● </span> : null}
                  {r.login}
                </td>
                <td>{r.fullName ?? <span className="text-muted-foreground">kutilmoqda</span>}</td>
                <td className="text-xs">
                  {r.link ? (r.link.used_at ? "havola ishlatilgan" : "havola faol") : "havola yo'q"}
                </td>
                <td className="text-xs">{fmtTime(r.firstLoginAt)}</td>
                <td className="text-xs">{fmtTime(r.lastSeenAt)}</td>
                <td className="whitespace-nowrap">
                  <button
                    className="btn-ghost text-xs"
                    onClick={() => copyOne(r.id, r.link?.token, !!r.link?.used_at)}
                  >
                    {r.link && !r.link.used_at ? "Nusxalash" : "Yangilash"}
                  </button>
                  <button
                    className="btn-ghost text-xs"
                    onClick={async () => {
                      try {
                        const res = await resetPwFn({ data: { accountId: r.id } });
                        const ok = await copyText(`Login: ${res.login}\nParol: ${res.password}`);
                        toast.success(
                          ok ? "Yangi parol nusxalandi" : `Yangi parol: ${res.password}`,
                          { duration: 15000 },
                        );
                      } catch (err) {
                        toast.error((err as Error).message);
                      }
                    }}
                  >
                    Yangi parol
                  </button>
                  {otherGroups.length > 0 && (
                    <select
                      className="rounded-md border border-border bg-background px-2 py-1 text-xs ml-1"
                      defaultValue=""
                      onChange={async (e) => {
                        if (!e.target.value) return;
                        try {
                          await moveFn({ data: { accountId: r.id, toGroupId: e.target.value } });
                          toast.success("Boshqa guruhga ko'chirildi");
                          qc.invalidateQueries({ queryKey: ["group-accounts", groupId] });
                          qc.invalidateQueries({ queryKey: ["group-students", groupId] });
                        } catch (err) {
                          toast.error((err as Error).message);
                        }
                      }}
                    >
                      <option value="">Ko'chirish...</option>
                      {otherGroups.map((g) => (
                        <option key={g.group_id} value={g.group_id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    className="btn-ghost text-xs text-red-600 ml-1"
                    onClick={async () => {
                      if (!confirm(`${r.login} o'chirilsinmi?`)) return;
                      try {
                        await removeFn({ data: { accountId: r.id } });
                        toast.success("O'chirildi");
                        qc.invalidateQueries({ queryKey: ["group-accounts", groupId] });
                      } catch (err) {
                        toast.error((err as Error).message);
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
        {rows.length === 0 && !isLoading && (
          <p className="text-sm text-muted-foreground py-3">Hali login yaratilmagan.</p>
        )}
      </div>
    </div>
  );
}
