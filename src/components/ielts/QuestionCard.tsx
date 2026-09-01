// IELTS savol kartochkasi — barcha savol turlari uchun yagona ko'rinish.
import type { IeltsQuestion } from "@/lib/ielts-types";

type Props = {
  q: IeltsQuestion;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  correct?: string;
  ok?: boolean;
  explain?: string;
};

const TF = ["TRUE", "FALSE", "NOT GIVEN"];
const YN = ["YES", "NO", "NOT GIVEN"];

export default function QuestionCard({ q, value, onChange, disabled, correct, ok, explain }: Props) {
  const choices =
    q.type === "true_false_ng"
      ? TF
      : q.type === "yes_no_ng"
        ? YN
        : q.options?.length
          ? q.options
          : null;

  return (
    <div
      className={`rounded-xl border p-3 ${
        correct === undefined
          ? "border-border"
          : ok
            ? "border-emerald-500/60 bg-emerald-500/5"
            : "border-red-500/60 bg-red-500/5"
      }`}
    >
      <div className="text-sm font-medium">
        <span className="text-muted-foreground mr-1">{q.number}.</span>
        {q.prompt}
      </div>
      {q.limit && <div className="text-xs text-muted-foreground mt-1">({q.limit})</div>}

      {choices ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {choices.map((opt, i) => {
            const label = q.options?.length && q.type !== "true_false_ng" && q.type !== "yes_no_ng"
              ? `${String.fromCharCode(65 + i)}. ${opt}`
              : opt;
            const val = q.options?.length && q.type !== "true_false_ng" && q.type !== "yes_no_ng"
              ? String.fromCharCode(65 + i)
              : opt;
            return (
              <button
                key={opt + i}
                type="button"
                disabled={disabled}
                onClick={() => onChange(val)}
                className={`text-left text-sm rounded-lg border px-3 py-2 disabled:opacity-70 ${
                  value === val ? "border-primary bg-primary/10" : "border-border"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      ) : (
        <input
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Javobingiz..."
          className="mt-2 w-full rounded-lg border bg-background px-3 py-2 text-sm disabled:opacity-70"
        />
      )}

      {correct !== undefined && (
        <div className="mt-2 text-xs">
          <div className={ok ? "text-emerald-600" : "text-red-600"}>
            {ok ? "✅ To'g'ri" : `❌ To'g'ri javob: ${correct}`}
          </div>
          {explain && <div className="text-muted-foreground mt-1">{explain}</div>}
        </div>
      )}
    </div>
  );
}
