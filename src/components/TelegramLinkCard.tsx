import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createTelegramLink, telegramStatus, unlinkTelegram } from "@/lib/telegram.functions";

/** "Telegram botni ulash" kartasi — bir martalik havola beradi. */
export default function TelegramLinkCard() {
  const qc = useQueryClient();
  const statusFn = useServerFn(telegramStatus);
  const linkFn = useServerFn(createTelegramLink);
  const unlinkFn = useServerFn(unlinkTelegram);

  const { data, isLoading } = useQuery({ queryKey: ["telegram-status"], queryFn: () => statusFn() });

  const link = useMutation({
    mutationFn: () => linkFn(),
    onSuccess: (r) => {
      window.open(r.url, "_blank", "noopener");
      toast.success("Telegram ochildi — 'Start' tugmasini bosing");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unlink = useMutation({
    mutationFn: () => unlinkFn(),
    onSuccess: () => {
      toast.success("Telegram uzildi");
      qc.invalidateQueries({ queryKey: ["telegram-status"] });
    },
  });

  if (isLoading) return null;

  return (
    <div className="card-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-bold">📲 Telegram bot</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {data?.linked
              ? `Ulangan${data.username ? ` — @${data.username}` : ""}. Bot sizga kunlik so'zlar, eslatma va testlarni yuboradi.`
              : "Botni ulasangiz, kunlik so'zlar, topshiriq eslatmalari va tezkor testlar Telegramga keladi."}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn-primary" disabled={link.isPending} onClick={() => link.mutate()}>
          {data?.linked ? "Qayta ulash" : link.isPending ? "Tayyorlanmoqda..." : "Telegram botni ulash"}
        </button>
        {data?.linked && (
          <button className="btn-ghost" onClick={() => unlink.mutate()}>
            Uzish
          </button>
        )}
      </div>
    </div>
  );
}
