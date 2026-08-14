import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { adminDeleteKey, adminKeyReport, adminSetKeyActive } from "@/lib/keys.functions";

/** Admin: butun tizimdagi Gemini API kalitlari — holati, egasi, limit tiklanishi. */
export default function ApiKeysSection({ enabled }: { enabled: boolean }) {
  const qc = useQueryClient();
  const reportFn = useServerFn(adminKeyReport);
  const toggleFn = useServerFn(adminSetKeyActive);
  const deleteFn = useServerFn(adminDeleteKey);
  const [live, setLive] = useState(false);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["admin-keys", live],
    queryFn: () => reportFn({ data: { live } }),
    enabled,
    refetchInterval: 60000,
  });

  const toggleMut = useMutation({
    mutationFn: (v: { id: string; active: boolean }) => toggleFn({ data: v }),
    onSuccess: () => {
      toast.success("Kalit holati yangilandi");
      qc.invalidateQueries({ queryKey: ["admin-keys"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Kalit o'chirildi");
      qc.invalidateQueries({ queryKey: ["admin-keys"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const keys = data?.keys ?? [];

  return (
    <section className="card-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold">API kalitlar ({data?.total ?? 0})</h2>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
            Google'dan jonli tekshirish
          </label>
          <button className="btn-ghost text-xs" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? "Tekshirilmoqda..." : "Yangilash"}
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5 text-center text-sm">
        <Stat label="Jami" value={data?.total ?? 0} />
        <Stat label="Ishlayapti" value={data?.working ?? 0} />
        <Stat label="Limitda" value={data?.limited ?? 0} />
        <Stat label="Nosoz" value={data?.broken ?? 0} />
        <Stat label="Umumiy / shaxsiy" value={`${data?.shared ?? 0} / ${data?.personal ?? 0}`} />
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Gemini bepul limiti har daqiqada tiklanadi. Limitga urilgan kalit ~65 soniya kutish rejimiga
        o'tadi, noto'g'ri kalit esa 30 daqiqaga chetlatiladi. Admin qo'shgan kalitlar butun tizim uchun
        umumiy, o'quvchi qo'shgani faqat o'ziga ishlaydi.
      </p>

      {keys.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Hozircha kalit yo'q.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="text-left">
                <th className="py-1 pr-3">Kalit</th>
                <th className="py-1 pr-3">Turi</th>
                <th className="py-1 pr-3">Egasi / izoh</th>
                <th className="py-1 pr-3">Holati</th>
                <th className="py-1 pr-3">Limit tiklanishi</th>
                <th className="py-1 pr-3">Qo'shilgan</th>
                <th className="py-1"></th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k, i) => (
                <tr key={k.id ?? `env-${i}`} className="border-t border-border/60">
                  <td className="py-2 pr-3 font-mono text-xs">{k.masked}</td>
                  <td className="py-2 pr-3">{k.scope}</td>
                  <td className="py-2 pr-3">{k.label ?? "—"}</td>
                  <td className="py-2 pr-3">
                    <span
                      className={
                        !k.active
                          ? "text-muted-foreground"
                          : k.status === "ok"
                            ? "text-emerald-600"
                            : k.status === "limit"
                              ? "text-amber-600"
                              : "text-destructive"
                      }
                    >
                      {!k.active ? "O'chirilgan" : k.statusText}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    {k.cooldownUntil ? new Date(k.cooldownUntil).toLocaleTimeString("uz-UZ") : "—"}
                  </td>
                  <td className="py-2 pr-3">
                    {k.createdAt ? new Date(k.createdAt).toLocaleDateString("uz-UZ") : "env"}
                  </td>
                  <td className="py-2 text-right whitespace-nowrap">
                    {k.id && (
                      <>
                        <button
                          className="text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => toggleMut.mutate({ id: k.id!, active: !k.active })}
                        >
                          {k.active ? "O'chirish" : "Yoqish"}
                        </button>
                        <button
                          className="ml-3 text-xs text-muted-foreground hover:text-destructive"
                          onClick={() => {
                            if (confirm("Bu kalit butunlay o'chirilsinmi?")) delMut.mutate(k.id!);
                          }}
                        >
                          Bazadan o'chirish
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-border p-2">
      <div className="text-lg font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
