import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  copyMaterial,
  createMaterial,
  deleteMaterial,
  listMaterials,
} from "@/lib/teacher.functions";
import type { GroupOverview } from "@/lib/teacher-ui";

interface Material {
  id: string;
  group_id: string | null;
  title: string;
  kind: string;
  content: string;
  created_at: string;
}

/** A11 + A12 — ustozning o'z materiallari va ularni boshqa guruhga ko'chirish. */
export default function MaterialsTab({
  groupId,
  groups,
}: {
  groupId: string;
  groups: GroupOverview[];
}) {
  const qc = useQueryClient();
  const list = useServerFn(listMaterials);
  const create = useServerFn(createMaterial);
  const copy = useServerFn(copyMaterial);
  const del = useServerFn(deleteMaterial);

  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"words" | "topic">("words");
  const [content, setContent] = useState("");

  const { data = [] } = useQuery({
    queryKey: ["materials"],
    queryFn: () => list() as Promise<Material[]>,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["materials"] });

  const addMut = useMutation({
    mutationFn: () => create({ data: { groupId, title, kind, content } }),
    onSuccess: () => {
      setTitle("");
      setContent("");
      toast.success("Material saqlandi");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const copyMut = useMutation({
    mutationFn: (v: { id: string; toGroupId: string }) => copy({ data: v }),
    onSuccess: () => {
      toast.success("Material nusxalandi");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const mine = data.filter((m) => m.group_id === groupId);
  const others = data.filter((m) => m.group_id !== groupId);

  function card(m: Material, own: boolean) {
    return (
      <div key={m.id} className="card-surface p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-semibold">{m.title}</div>
            <div className="text-xs text-muted-foreground">
              {m.kind === "words" ? "So'z ro'yxati" : "Mavzu"} ·{" "}
              {groups.find((g) => g.group_id === m.group_id)?.name ?? "Guruhsiz"}
            </div>
          </div>
          <button
            className="text-xs text-muted-foreground hover:text-destructive"
            onClick={() => delMut.mutate(m.id)}
          >
            O'chirish
          </button>
        </div>
        <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap text-sm text-muted-foreground">
          {m.content}
        </pre>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Boshqa guruhga nusxalash:</span>
          {groups
            .filter((g) => g.group_id !== m.group_id)
            .map((g) => (
              <button
                key={g.group_id}
                className="btn-ghost text-xs py-1"
                onClick={() => copyMut.mutate({ id: m.id, toGroupId: g.group_id })}
              >
                {g.name}
              </button>
            ))}
          {!own && (
            <button
              className="btn-ghost text-xs py-1"
              onClick={() => copyMut.mutate({ id: m.id, toGroupId: groupId })}
            >
              Shu guruhga olish
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card-surface p-4">
        <h3 className="font-bold mb-3">Yangi material</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="Sarlavha"
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
          />
          <select
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
          >
            <option value="words">So'z ro'yxati</option>
            <option value="topic">Mavzu / matn</option>
          </select>
        </div>
        <textarea
          className="mt-3 w-full min-h-28 rounded-md border border-border bg-background px-3 py-2 text-sm"
          placeholder={
            kind === "words"
              ? "Har bir qatorda: word - tarjima"
              : "Mavzu tavsifi — AI shu material asosida savol va mashq generatsiya qiladi"
          }
          value={content}
          maxLength={8000}
          onChange={(e) => setContent(e.target.value)}
        />
        <button
          className="btn-primary mt-3 disabled:opacity-50"
          disabled={title.trim().length < 2 || content.trim().length < 1 || addMut.isPending}
          onClick={() => addMut.mutate()}
        >
          Saqlash
        </button>
      </div>

      <h3 className="font-bold">Shu guruh materiallari</h3>
      {mine.length === 0 && <p className="text-sm text-muted-foreground">Hali material yo'q.</p>}
      {mine.map((m) => card(m, true))}

      {others.length > 0 && (
        <>
          <h3 className="font-bold pt-2">Boshqa guruhlardagi materiallar</h3>
          {others.map((m) => card(m, false))}
        </>
      )}
    </div>
  );
}
