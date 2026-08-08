import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  addCurriculum,
  deleteCurriculum,
  listCurriculum,
  markCurriculumTaught,
} from "@/lib/teacher.functions";

interface Entry {
  id: string;
  topic: string;
  planned_date: string | null;
  taught_at: string | null;
  notes: string | null;
}

/** A15 — dars dasturi kuzatuvchisi (curriculum tracker). */
export default function CurriculumTab({ groupId }: { groupId: string }) {
  const qc = useQueryClient();
  const list = useServerFn(listCurriculum);
  const add = useServerFn(addCurriculum);
  const mark = useServerFn(markCurriculumTaught);
  const del = useServerFn(deleteCurriculum);

  const [topic, setTopic] = useState("");
  const [planned, setPlanned] = useState("");
  const [notes, setNotes] = useState("");

  const { data = [] } = useQuery({
    queryKey: ["curriculum", groupId],
    queryFn: () => list({ data: { groupId } }) as Promise<Entry[]>,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["curriculum", groupId] });

  const addMut = useMutation({
    mutationFn: () =>
      add({ data: { groupId, topic, plannedDate: planned || undefined, notes: notes || undefined } }),
    onSuccess: () => {
      setTopic("");
      setPlanned("");
      setNotes("");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const markMut = useMutation({
    mutationFn: (v: { id: string; taught: boolean }) => mark({ data: v }),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const doneCount = data.filter((e) => e.taught_at).length;
  const overdue = data.filter(
    (e) => !e.taught_at && e.planned_date && e.planned_date < new Date().toISOString().slice(0, 10),
  );

  return (
    <div className="space-y-4">
      <div className="card-surface p-4">
        <h3 className="font-bold mb-3">Dars dasturiga mavzu qo'shish</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <input
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="Mavzu"
            value={topic}
            maxLength={120}
            onChange={(e) => setTopic(e.target.value)}
          />
          <input
            type="date"
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={planned}
            onChange={(e) => setPlanned(e.target.value)}
          />
          <input
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="Izoh (ixtiyoriy)"
            value={notes}
            maxLength={500}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        <button
          className="btn-primary mt-3 disabled:opacity-50"
          disabled={topic.trim().length < 2 || addMut.isPending}
          onClick={() => addMut.mutate()}
        >
          Qo'shish
        </button>
      </div>

      <div className="card-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold">
            Dastur bo'yicha: {doneCount}/{data.length} mavzu o'tilgan
          </h3>
          {overdue.length > 0 && (
            <span className="text-xs rounded-full bg-destructive/15 text-destructive px-2 py-1">
              {overdue.length} ta mavzu muddati o'tib ketdi
            </span>
          )}
        </div>
        <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full gradient-brand"
            style={{ width: `${data.length ? (doneCount / data.length) * 100 : 0}%` }}
          />
        </div>
        <ul className="mt-4 space-y-2">
          {data.length === 0 && (
            <li className="text-sm text-muted-foreground">Dastur hali bo'sh.</li>
          )}
          {data.map((e) => (
            <li
              key={e.id}
              className="flex items-center gap-3 rounded-md border border-border px-3 py-2"
            >
              <input
                type="checkbox"
                checked={!!e.taught_at}
                onChange={(ev) => markMut.mutate({ id: e.id, taught: ev.target.checked })}
              />
              <div className="flex-1">
                <div className={e.taught_at ? "line-through text-muted-foreground" : "font-medium"}>
                  {e.topic}
                </div>
                <div className="text-xs text-muted-foreground">
                  {e.planned_date ? `Reja: ${e.planned_date}` : "Reja sanasi yo'q"}
                  {e.taught_at ? ` · O'tilgan: ${e.taught_at}` : ""}
                  {e.notes ? ` · ${e.notes}` : ""}
                </div>
              </div>
              <button
                className="text-xs text-muted-foreground hover:text-destructive"
                onClick={() => delMut.mutate(e.id)}
              >
                O'chirish
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
