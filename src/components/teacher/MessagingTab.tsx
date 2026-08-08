import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { listGroupMessages, sendGroupMessage } from "@/lib/access.functions";
import { fmtTime } from "@/lib/clipboard";

/** Guruhga (yoki barcha guruhlarga) umumiy xabar yuborish. */
export default function MessagingTab({ groupId }: { groupId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listGroupMessages);
  const sendFn = useServerFn(sendGroupMessage);
  const [text, setText] = useState("");
  const [toAll, setToAll] = useState(false);

  const { data: messages = [] } = useQuery({
    queryKey: ["group-messages", groupId],
    queryFn: () => listFn({ data: { groupId } }),
  });

  const mut = useMutation({
    mutationFn: () => sendFn({ data: { groupId, body: text.trim(), allGroups: toAll } }),
    onSuccess: () => {
      setText("");
      toast.success("Xabar yuborildi");
      qc.invalidateQueries({ queryKey: ["group-messages", groupId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="card-surface p-4">
        <h3 className="font-bold">Xabar yuborish</h3>
        <textarea
          className="mt-3 w-full rounded-md border border-border bg-background px-3 py-2 text-sm min-h-24"
          placeholder="O'quvchilarga xabar..."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={toAll} onChange={(e) => setToAll(e.target.checked)} />
          Barcha guruhlarimga yuborilsin
        </label>
        <button
          className="btn-primary mt-3 disabled:opacity-50"
          disabled={text.trim().length < 2 || mut.isPending}
          onClick={() => mut.mutate()}
        >
          {mut.isPending ? "Yuborilmoqda..." : "Yuborish"}
        </button>
      </div>

      <div className="card-surface p-4">
        <h3 className="font-bold">Yuborilgan xabarlar</h3>
        <div className="mt-3 divide-y divide-border/60">
          {messages.map((m) => (
            <div key={m.id} className="py-2">
              <div className="text-sm whitespace-pre-wrap">{m.body}</div>
              <div className="text-xs text-muted-foreground">{fmtTime(m.created_at)}</div>
            </div>
          ))}
          {messages.length === 0 && <p className="text-sm text-muted-foreground py-2">Xabar yo'q.</p>}
        </div>
      </div>
    </div>
  );
}
