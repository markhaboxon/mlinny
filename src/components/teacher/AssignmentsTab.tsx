import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createAssignment, deleteAssignment, listAssignments } from "@/lib/teacher.functions";
import type { StudentRow } from "@/lib/teacher-ui";

interface Props {
  groupId: string;
  students: StudentRow[];
}

interface AssignmentRow {
  id: string;
  title: string;
  topic: string | null;
  level: string;
  note: string | null;
  due_date: string | null;
  target_student_id: string | null;
  assignment_completions: { student_id: string; completed_at: string }[];
}

/** A6 — vazifa/topshiriq biriktirish va bajarilishini kuzatish. */
export default function AssignmentsTab({ groupId, students }: Props) {
  const qc = useQueryClient();
  const list = useServerFn(listAssignments);
  const create = useServerFn(createAssignment);
  const remove = useServerFn(deleteAssignment);

  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState<"oson" | "orta" | "qiyin">("orta");
  const [due, setDue] = useState("");
  const [target, setTarget] = useState("");
  const [note, setNote] = useState("");

  const { data = [] } = useQuery({
    queryKey: ["assignments", groupId],
    queryFn: () => list({ data: { groupId } }) as Promise<AssignmentRow[]>,
  });

  const addMut = useMutation({
    mutationFn: () =>
      create({
        data: {
          groupId,
          title,
          topic: topic || undefined,
          level,
          dueDate: due || undefined,
          note: note || undefined,
          targetStudentId: target || undefined,
        },
      }),
    onSuccess: () => {
      setTitle("");
      setTopic("");
      setDue("");
      setNote("");
      setTarget("");
      toast.success("Topshiriq yuborildi");
      qc.invalidateQueries({ queryKey: ["assignments", groupId] });
      qc.invalidateQueries({ queryKey: ["students", groupId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["assignments", groupId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const nameOf = (id: string) => students.find((s) => s.student_id === id)?.name ?? "O'quvchi";

  return (
    <div className="space-y-4">
      <div className="card-surface p-4">
        <h3 className="font-bold mb-3">Yangi topshiriq</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="Sarlavha (masalan: Present Perfect mashqi)"
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="Mavzu (ixtiyoriy)"
            value={topic}
            maxLength={120}
            onChange={(e) => setTopic(e.target.value)}
          />
          <select
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={level}
            onChange={(e) => setLevel(e.target.value as typeof level)}
          >
            <option value="oson">Oson</option>
            <option value="orta">O'rta</option>
            <option value="qiyin">Qiyin</option>
          </select>
          <input
            type="date"
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={due}
            onChange={(e) => setDue(e.target.value)}
          />
          <select
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          >
            <option value="">Butun guruhga</option>
            {students.map((s) => (
              <option key={s.student_id} value={s.student_id}>
                Faqat: {s.name}
              </option>
            ))}
          </select>
          <input
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="Izoh (ixtiyoriy)"
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <button
          className="btn-primary mt-3 disabled:opacity-50"
          disabled={title.trim().length < 2 || addMut.isPending}
          onClick={() => addMut.mutate()}
        >
          {addMut.isPending ? "Yuborilmoqda..." : "Topshiriqni yuborish"}
        </button>
      </div>

      <div className="space-y-3">
        {data.length === 0 && <p className="text-sm text-muted-foreground">Hali topshiriq yo'q.</p>}
        {data.map((a) => {
          const targets = a.target_student_id
            ? students.filter((s) => s.student_id === a.target_student_id)
            : students;
          const doneIds = new Set(a.assignment_completions?.map((c) => c.student_id) ?? []);
          const done = targets.filter((s) => doneIds.has(s.student_id));
          const notDone = targets.filter((s) => !doneIds.has(s.student_id));
          return (
            <div key={a.id} className="card-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{a.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {a.topic ? `${a.topic} · ` : ""}
                    {a.level}
                    {a.due_date ? ` · muddat: ${a.due_date}` : ""}
                    {a.target_student_id ? ` · ${nameOf(a.target_student_id)}` : " · butun guruh"}
                  </div>
                  {a.note && <p className="mt-1 text-sm">{a.note}</p>}
                </div>
                <button
                  className="text-xs text-muted-foreground hover:text-destructive"
                  onClick={() => delMut.mutate(a.id)}
                >
                  O'chirish
                </button>
              </div>
              <div className="mt-3 text-sm">
                <span className="font-semibold text-emerald-600">
                  Bajardi ({done.length}/{targets.length}):
                </span>{" "}
                {done.length ? done.map((s) => s.name).join(", ") : "—"}
              </div>
              <div className="text-sm">
                <span className="font-semibold text-destructive">Bajarmadi:</span>{" "}
                {notDone.length ? notDone.map((s) => s.name).join(", ") : "—"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
