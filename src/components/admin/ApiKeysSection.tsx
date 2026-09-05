import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { adminKeysReport, adminToggleKey } from "@/lib/keys.functions";
import { openApiKeyDialog } from "@/components/ApiKeyDialog";

function fmt(v: string | null) {
  if (!v) return "—";
  return new Date(v).toLocaleString("uz-UZ", { dateStyle: "short", timeStyle: "short" });
}

const STATUS_STYLE: Record<string, string> = {
  ishlayapti: "text-emerald-600",
  "kutish rejimida": "text-amber-600",
  "o'chirilgan": "text-muted-foreground",
  "hali ishlatilmagan": "text-sky-600",
};

/** Admin: umumiy bazadagi barcha API kalitlar bo'yicha to'liq hisobot. */
export default function ApiKeysSection({ enabled = true }: { enabled?: boolean }) {
  const qc = useQueryClient();
  const reportFn = useServerFn(adminKeysReport);
  const toggleFn = useServerFn(adminToggleKey);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-keys"],
    queryFn: () => reportFn(),
    enabled,
    retry: false,
    throwOnError: false,
    refetchInterval: enabled ? 20000 : false,
  });

  const mut = useMutation({
    mutationFn: (v: { id: string; active?: boolean; remove?: boolean }) => toggleFn({ data: v }),
    onSuccess: () => {
      toast.success("Saqlandi");
      qc.invalidateQueries({ queryKey: ["admin-keys"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = data?.rows ?? [];
  const working = rows.filter((r) => r.status === "ishlayapti").length;
  const cooling = rows.filter((r) => r.status === "kutish rejimida").length;
  const global = rows.filter((r) => r.scope !== "user").length;
  const personal = rows.length - global;
  const callsToday = rows.reduce((s, r) => s + r.callsToday, 0);

  return (
    <section className="card-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-bold">API kalitlar ({rows.length + (data?.envKeys ?? 0)})</h2>
          <p className="text-sm text-muted-foreground">
            Umumiy bazadagi barcha Gemini kalitlari, holati va limit hisobi.
          </p>
        </div>
        <button className="btn-primary text-sm" onClick={() => openApiKeyDialog(false)}>
          ➕ Yangi kalit ulash (umumiy)
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
        <Box label="Ishlayapti" value={working} />
        <Box label="Kutish rejimida" value={cooling} />
        <Box label="Umumiy kalit" value={global + (data?.envKeys ?? 0)} />
        <Box label="Shaxsiy kalit" value={personal} />
        <Box label="Bugungi so'rovlar" value={callsToday} />
      </div>

      <div className="mt-3 rounded-lg border border-border p-3 text-xs text-muted-foreground space-y-1">
        <div>
          ⏱ <b>Daqiqalik limit</b> har <b>{data?.minuteWindowSec ?? 65} soniya</b>dan keyin qayta tiklanadi —
          limitga urilgan kalit shu vaqtdan keyin avtomatik qaytadi.
        </div>
        <div>
          📅 <b>Kunlik limit</b> Tinch okeani yarim tunida qayta beriladi — sizning vaqtingizda:{" "}
          <b>{fmt(data?.dailyResetAt ?? null)}</b>.
        </div>
        <div>
          🔐 Server maxfiy kalitlari (env): <b>{data?.envKeys ?? 0}</b> ta — ular jadvalda ko'rsatilmaydi.
        </div>
      </div>

      {error ? (
        <p className="mt-3 text-sm text-red-600/80">
          Bu bo'limni faqat admin ko'ra oladi.
        </p>
      ) : isLoading ? (
        <p className="mt-3 text-sm text-muted-foreground">Yuklanmoqda...</p>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Hali bazada API kalit yo'q.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-2">Kalit</th>
                <th>Turi</th>
                <th>Egasi</th>
                <th>Holati</th>
                <th>Qayta tiklanadi</th>
                <th>Bugun</th>
                <th>Jami</th>
                <th>Oxirgi ishlatilgan</th>
                <th>Oxirgi xato</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border/60 align-top">
                  <td className="py-2 font-mono text-xs">{r.masked}</td>
                  <td className="text-xs">{r.scope === "user" ? "👤 shaxsiy" : "🌐 umumiy"}</td>
                  <td className="text-xs">{r.ownerName ?? "—"}</td>
                  <td className={`text-xs font-semibold ${STATUS_STYLE[r.status] ?? ""}`}>{r.status}</td>
                  <td className="text-xs">
                    {r.minuteResetIn != null ? `${r.minuteResetIn} soniyadan keyin` : "—"}
                  </td>
                  <td className="text-xs">{r.callsToday}</td>
                  <td className="text-xs">{r.callsTotal}</td>
                  <td className="text-xs">{fmt(r.lastOkAt)}</td>
                  <td className="text-xs max-w-[220px] break-words text-red-600/80">
                    {r.lastError ?? "—"}
                  </td>
                  <td className="whitespace-nowrap">
                    <button
                      className="btn-ghost text-xs"
                      onClick={() => mut.mutate({ id: r.id, active: !r.active })}
                    >
                      {r.active ? "O'chirish" : "Yoqish"}
                    </button>
                    <button
                      className="btn-ghost text-xs text-red-600"
                      onClick={() => {
                        if (confirm("Kalit butunlay o'chirilsinmi?")) mut.mutate({ id: r.id, remove: true });
                      }}
                    >
                      Olib tashlash
                    </button>
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

function Box({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-bold">{value}</div>
    </div>
  );
}
