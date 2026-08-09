import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { createAssignment } from "@/lib/teacher.functions";
import { genAssignmentDraft, listStudentSubmissions } from "@/lib/grading.functions";
import type { StudentRow } from "@/lib/teacher-ui";

interface Props {
  groupId: string;
  students: StudentRow[];
}

interface Draft {
  title: string;
  instructions: string;
  tasks: { q: string; answer: string }[];
}

/** G — Ustoz uchun AI: topshiriq generatori va AI baholagan ishlarni ko'rish. */
export default function AiToolsTab({ groupId, students }: Props) {
  const gen = useServerFn(genAssignmentDraft);
  const create = useServerFn(createAssignment);
  const listSubs = useServerFn(listStudentSubmissions);

  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState<"past" | "orta" | "yaxshi">("orta");
  const [kind, setKind] = useState<"test" | "writing" | "speaking" | "vocab">("test");
  const [count, setCount] = useState(10);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [studentId, setStudentId] = useState("");

  const genMut = useMutation({
    mutationFn: () => gen({ data: { topic, level, kind, count } }) as Promise<Draft>,
    onSuccess: (d) => setDraft(d),
    onError: (e: Error) => toast.error(e.message),
  });

  const sendMut = useMutation({
    mutationFn: () =>
      create({
        data: {
          groupId,
          title: draft?.title ?? topic,
          topic: topic || undefined,
          level: level === "past" ? "oson" : level === "yaxshi" ? "qiyin" : "orta",
          note: draft
            ? `${draft.instructions}\n\n${draft.tasks.map((t, i) => `${i + 1}. ${t.q}`).join("\n")}`
            : undefined,
        },
      }),
    onSuccess: () => toast.success("Topshiriq guruhga yuborildi"),
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: subs = [] } = useQuery({
    queryKey: ["teacher-submissions", studentId],
    queryFn: () => listSubs({ data: { studentId: studentId || null } }),
    retry: false,
  });

  return (
    <div className="space-y-6">
      <div className="card-surface p-4 space-y-3">
        <div className="font-semibold">🤖 AI topshiriq generatori</div>
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="Mavzu (masalan: Past Simple)"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
          <div className="flex gap-2">
            <select
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={level}
              onChange={(e) => setLevel(e.target.value as typeof level)}
            >
              <option value="past">Past</option>
              <option value="orta">O'rta</option>
              <option value="yaxshi">Yaxshi</option>
            </select>
            <select
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
            >
              <option value="test">Test</option>
              <option value="writing">Writing</option>
              <option value="speaking">Speaking</option>
              <option value="vocab">Vocab</option>
            </select>
            <input
              type="number"
              min={3}
              max={20}
              className="w-20 rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
            />
          </div>
        </div>
        <button
          className="btn-primary disabled:opacity-40"
          disabled={genMut.isPending || topic.trim().length < 2}
          onClick={() => genMut.mutate()}
        >
          {genMut.isPending ? "Tuzilmoqda..." : "Yaratish"}
        </button>

        {draft && (
          <div className="rounded-2xl border border-border p-3 space-y-2">
            <div className="font-semibold">{draft.title}</div>
            <p className="text-sm text-muted-foreground">{draft.instructions}</p>
            <ol className="text-sm list-decimal pl-5 space-y-1">
              {draft.tasks.map((t) => (
                <li key={t.q}>
                  {t.q}
                  <span className="text-muted-foreground"> — {t.answer}</span>
                </li>
              ))}
            </ol>
            <button
              className="btn-primary text-sm disabled:opacity-40"
              disabled={sendMut.isPending}
              onClick={() => sendMut.mutate()}
            >
              Guruhga yuborish
            </button>
          </div>
        )}
      </div>

      <div className="card-surface p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="font-semibold">📝 AI baholagan ishlar</div>
          <select
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
          >
            <option value="">Barcha o'quvchilar</option>
            {students.map((s) => (
              <option key={s.student_id} value={s.student_id}>
                {s.name ?? s.student_id.slice(0, 8)}
              </option>
            ))}
          </select>
        </div>
        {subs.length === 0 && <p className="text-sm text-muted-foreground">Hozircha ish yo'q.</p>}
        {subs.map((s) => (
          <div key={s.id} className="rounded-2xl border border-border p-3 text-sm space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-medium">
                {s.kind === "essay" ? "Insho" : "Speaking"} · {s.score ?? "-"}/100
              </span>
              <span className="text-xs text-muted-foreground">{s.createdAt.slice(0, 10)}</span>
            </div>
            <p className="text-muted-foreground whitespace-pre-wrap">{s.content}</p>
            {s.feedback?.summary && (
              <p className="rounded-lg bg-muted p-2 text-xs">🤖 {s.feedback.summary}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
