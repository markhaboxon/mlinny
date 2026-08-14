import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  completeAssignment,
  joinGroup,
  leaveGroup,
  myAssignments,
  myCurriculum,
  myGroup,
} from "@/lib/teacher.functions";
import { listGroupMessages } from "@/lib/access.functions";
import { DAY_NAMES } from "@/lib/teacher-ui";
import { useAuthUser } from "@/hooks/useCloudSync";
import { useRequireRole } from "@/hooks/useRequireRole";

export const Route = createFileRoute("/group")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Mening guruhim — Linny" },
      { name: "description", content: "Guruh kodini kiriting, topshiriqlaringizni va dars dasturini ko'ring." },
      { property: "og:title", content: "Mening guruhim — Linny" },
      { property: "og:description", content: "Ustoz bergan topshiriqlar va dars dasturi." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MyGroupPage,
});

interface GroupInfo {
  group_id: string;
  group_name: string;
  teacher_name: string | null;
  lesson_days: number[];
  joined_at: string;
  members_count: number;
}

interface AssignmentRow {
  id: string;
  title: string;
  topic: string | null;
  level: string;
  note: string | null;
  due_date: string | null;
  assignment_completions: { student_id: string; completed_at: string }[];
}

function MyGroupPage() {
  const user = useAuthUser();
  const guard = useRequireRole(["student"]);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [code, setCode] = useState("");

  const get = useServerFn(myGroup);
  const join = useServerFn(joinGroup);
  const leave = useServerFn(leaveGroup);
  const listA = useServerFn(myAssignments);
  const listC = useServerFn(myCurriculum);
  const done = useServerFn(completeAssignment);
  const listMsgs = useServerFn(listGroupMessages);

  const isStudent = guard.state === "ok";

  const { data: group } = useQuery({
    queryKey: ["my-group"],
    queryFn: () => get() as Promise<GroupInfo | null>,
    enabled: !!user && isStudent,
    retry: false,
  });
  const { data: assignments = [] } = useQuery({
    queryKey: ["my-assignments"],
    queryFn: () => listA() as Promise<AssignmentRow[]>,
    enabled: isStudent && !!group,
    retry: false,
  });
  const { data: curriculum = [] } = useQuery({
    queryKey: ["my-curriculum"],
    queryFn: () =>
      listC() as Promise<{ topic: string; planned_date: string | null; taught_at: string | null }[]>,
    enabled: isStudent && !!group,
    retry: false,
  });
  const { data: messages = [] } = useQuery({
    queryKey: ["my-group-messages", group?.group_id],
    queryFn: () => listMsgs({ data: { groupId: group!.group_id } }),
    enabled: isStudent && !!group,
    retry: false,
    refetchInterval: 60000,
  });

  const joinMut = useMutation({
    mutationFn: () => join({ data: { code } }),
    onSuccess: (g) => {
      toast.success(`"${g.group_name}" guruhiga qo'shildingiz`);
      setCode("");
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const leaveMut = useMutation({
    mutationFn: () => leave(),
    onSuccess: () => {
      toast.success("Guruhdan chiqdingiz");
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const doneMut = useMutation({
    mutationFn: (id: string) => done({ data: { id } }),
    onSuccess: () => {
      toast.success("Topshiriq bajarildi deb belgilandi");
      qc.invalidateQueries({ queryKey: ["my-assignments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (guard.state !== "ok") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <p className="text-sm text-muted-foreground">Yuklanmoqda...</p>
      </div>
    );
  }

  if (user === null) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card-surface p-6 text-center">
          <p>Guruhga qo'shilish uchun tizimga kiring.</p>
          <button className="btn-primary mt-4" onClick={() => navigate({ to: "/auth" })}>
            Kirish
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Mening guruhim</h1>
          <Link to="/" className="btn-ghost">
            Bosh sahifa
          </Link>
        </div>

        {!group ? (
          <div className="card-surface p-6 text-center">
            <div className="text-4xl">🔑</div>
            <h2 className="mt-2 font-bold">Guruh kodini kiriting</h2>
            <p className="text-sm text-muted-foreground">
              Ustozingiz bergan 6 xonali kodni kiriting.
            </p>
            <input
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              className="mt-4 w-40 mx-auto block rounded-md border border-border bg-background px-3 py-2 text-center text-lg font-mono tracking-widest"
            />
            <button
              className="btn-primary mt-4 disabled:opacity-50"
              disabled={code.length !== 6 || joinMut.isPending}
              onClick={() => joinMut.mutate()}
            >
              {joinMut.isPending ? "Qo'shilmoqda..." : "Guruhga qo'shilish"}
            </button>
          </div>
        ) : (
          <>
            <div className="card-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xl font-bold">{group.group_name}</div>
                  <div className="text-sm text-muted-foreground">
                    Ustoz: {group.teacher_name ?? "—"} · {group.members_count} o'quvchi
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Dars kunlari:{" "}
                    {group.lesson_days?.length
                      ? group.lesson_days.map((d) => DAY_NAMES[d]).join(", ")
                      : "belgilanmagan"}
                  </div>
                </div>
                <button
                  className="btn-ghost text-xs"
                  onClick={() => {
                    if (confirm("Guruhdan chiqmoqchimisiz?")) leaveMut.mutate();
                  }}
                >
                  Guruhdan chiqish
                </button>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Ustozingiz faqat o'quv natijalaringizni (streak, xatolar, faollik) ko'radi. Email va
                hisob ma'lumotlaringiz unga ko'rinmaydi.
              </p>
            </div>

            {messages.length > 0 && (
              <div className="card-surface p-4">
                <h2 className="font-bold">Ustoz xabarlari</h2>
                <ul className="mt-3 space-y-2">
                  {messages.map((m) => (
                    <li key={m.id} className="rounded-lg border border-border p-3">
                      <p className="text-sm whitespace-pre-wrap">{m.body}</p>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {new Date(m.created_at).toLocaleString("uz-UZ")}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="card-surface p-4">
              <h2 className="font-bold">Topshiriqlar</h2>
              {assignments.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">Hozircha topshiriq yo'q.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {assignments.map((a) => {
                    const isDone = (a.assignment_completions ?? []).some(
                      (c) => c.student_id === user?.id,
                    );
                    return (
                      <li
                        key={a.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
                      >
                        <div>
                          <div className={`font-medium ${isDone ? "line-through opacity-60" : ""}`}>
                            {a.title}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {a.topic ? `${a.topic} · ` : ""}
                            {a.level}
                            {a.due_date ? ` · muddat: ${a.due_date}` : ""}
                          </div>
                          {a.note && <p className="text-xs mt-1">{a.note}</p>}
                        </div>
                        {isDone ? (
                          <span className="text-xs text-emerald-600 whitespace-nowrap">Bajarildi ✓</span>
                        ) : (
                          <button className="btn-primary text-xs py-1" onClick={() => doneMut.mutate(a.id)}>
                            Bajardim
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {curriculum.length > 0 && (
              <div className="card-surface p-4">
                <h2 className="font-bold">Dars dasturi</h2>
                <ul className="mt-2 space-y-1 text-sm">
                  {curriculum.map((c, i) => (
                    <li key={i} className={c.taught_at ? "text-muted-foreground line-through" : ""}>
                      • {c.topic}
                      {c.planned_date ? ` — ${c.planned_date}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
