import { useEffect, useState } from "react";
import { addGeminiKey } from "@/lib/keys.functions";
import { aiErrorMessage } from "@/lib/ai-error";

export const OPEN_API_KEY_DIALOG = "linny:open-api-key-dialog";

export function openApiKeyDialog(exhausted = false) {
  window.dispatchEvent(new CustomEvent(OPEN_API_KEY_DIALOG, { detail: { exhausted } }));
}

/** Mounted once (root layout). Opens on demand or when all keys hit their limit. */
export default function ApiKeyDialog() {
  const [open, setOpen] = useState(false);
  const [exhausted, setExhausted] = useState(false);

  useEffect(() => {
    function onOpen(e: Event) {
      setExhausted(!!(e as CustomEvent).detail?.exhausted);
      setOpen(true);
    }
    window.addEventListener(OPEN_API_KEY_DIALOG, onOpen);
    return () => window.removeEventListener(OPEN_API_KEY_DIALOG, onOpen);
  }, []);

  if (!open) return null;
  return <Dialog exhausted={exhausted} onClose={() => setOpen(false)} />;
}

/** Sodda, AI ishlatmaydigan (tekin) qo'llanma — yosh bola ham tushunadi. */
const GUIDE: { title: string; steps: string[] }[] = [
  {
    title: "1-qadam — Google hisobingizga kiring",
    steps: [
      "Telefon yoki kompyuterda brauzerni (Chrome) oching.",
      "Yuqoridagi ko'k havolani bosing — u sizni aistudio.google.com/apikey sahifasiga olib boradi.",
      "Agar “Sign in” (Kirish) so'rasa, Gmail (Google) pochtangiz va parolingiz bilan kiring. Gmail bo'lmasa, avval Gmail ochib olish kerak.",
    ],
  },
  {
    title: "2-qadam — Shartlarga rozilik bering",
    steps: [
      "Ba'zan “I agree / Men roziman” degan katakcha chiqadi — katakchani belgilab, “Continue” (Davom etish) tugmasini bosing.",
      "Mamlakat so'ralsa, “Uzbekistan” ni tanlang.",
    ],
  },
  {
    title: "3-qadam — Kalitni yarating",
    steps: [
      "Sahifada ko'k rangdagi “Create API key” (API kalit yaratish) tugmasi bo'ladi — uni bosing.",
      "“Create API key in new project” (yangi loyihada yaratish) chiqsa, shuni bosing.",
      "10-20 soniya kutasiz — pastda uzun harf-raqamlar qatori paydo bo'ladi. Bu — sizning kalitingiz. U odatda “AIza...” bilan boshlanadi.",
    ],
  },
  {
    title: "4-qadam — Kalitni nusxalang",
    steps: [
      "Kalit yonidagi “Copy” (nusxa olish) belgisini bosing — kalit telefon xotirasiga olinadi.",
      "Copy tugmasi ko'rinmasa: kalit ustiga barmog'ingizni bosib turasiz → “Nusxalash / Copy” ni tanlaysiz.",
    ],
  },
  {
    title: "5-qadam — Linny'ga kiritib qo'yasiz",
    steps: [
      "Shu oynaga qaytasiz (Linny sayti).",
      "Pastdagi bo'sh qatorni bosib turib “Qo'yish / Paste” ni tanlaysiz — kalit o'zi yoziladi.",
      "“Ulash” tugmasini bosasiz. Yashil yozuv chiqsa — hammasi tayyor! 🎉",
    ],
  },
];

const GUIDE_NOTES = [
  "Kalit bepul — pul to'lash shart emas.",
  "Kalitni hech kimga bermang; u faqat sizning mashqlaringiz uchun ishlatiladi.",
  "“Bu kalit avval kiritilgan” degan yozuv chiqsa — Google AI Studio'da yana bir marta “Create API key” bosib, yangi kalit oling.",
  "Xato chiqsa, kalitni to'liq (boshidan oxirigacha, bo'shliqsiz) nusxalaganingizni tekshiring.",
];

function Dialog({ exhausted, onClose }: { exhausted: boolean; onClose: () => void }) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [guide, setGuide] = useState(false);

  async function submit() {
    if (key.trim().length < 15) {
      setError("API kalitni to'liq kiriting.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await addGeminiKey({ data: { apiKey: key.trim() } });
      if (!res.ok) {
        setError(res.error);
      } else {
        setDone(res.message);
        setKey("");
      }
    } catch (e) {
      setError(aiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="card-surface w-full max-w-lg p-5 md:p-6 max-h-[90vh] overflow-y-auto">
        {exhausted ? (
          <>
            <h2 className="text-lg md:text-xl font-bold">⚠️ Barcha API kalitlarda limit tugadi</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Ulangan barcha Gemini kalitlarining limiti tugagan. Yangi API kalit ulaysizmi? Yoki 1-2 daqiqa
              kutib qayta urinib ko'rishingiz mumkin.
            </p>
          </>
        ) : (
          <>
            <h2 className="text-lg md:text-xl font-bold">🔑 Yangi API ulash</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Google AI Studio dan olgan Gemini API kalitingizni kiriting — u faqat sizning mashqlaringiz
              uchun ishlatiladi.
            </p>
          </>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noreferrer"
            className="text-sm text-primary hover:underline"
          >
            Google AI Studio dan kalit olish →
          </a>
          <button
            type="button"
            onClick={() => setGuide((g) => !g)}
            className="text-sm font-semibold text-primary underline decoration-dotted"
          >
            📖 Yo'riqnoma {guide ? "(yopish)" : "— API qanday olinadi?"}
          </button>
        </div>

        {guide && (
          <div className="mt-3 rounded-xl border border-border bg-muted/40 p-3 text-sm space-y-3">
            <p className="font-semibold">
              Quyidagilarni ketma-ket bajarasiz — jami 2-3 daqiqa vaqt oladi:
            </p>
            {GUIDE.map((g) => (
              <div key={g.title}>
                <div className="font-semibold">{g.title}</div>
                <ol className="mt-1 list-decimal pl-5 space-y-1 text-muted-foreground">
                  {g.steps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
              </div>
            ))}
            <div>
              <div className="font-semibold">Muhim eslatmalar</div>
              <ul className="mt-1 list-disc pl-5 space-y-1 text-muted-foreground">
                {GUIDE_NOTES.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {done ? (
          <div className="mt-4 p-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-sm">
            {done}
          </div>
        ) : (
          <>
            <input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="AIza... yoki AQ...."
              spellCheck={false}
              autoComplete="off"
              className="mt-4 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
            {error && (
              <div className="mt-3 p-3 rounded-xl border border-red-500/40 bg-red-500/10 text-sm text-red-600 dark:text-red-400">
                {error}
              </div>
            )}
          </>
        )}

        <div className="mt-5 flex flex-wrap gap-2 justify-end">
          <button onClick={onClose} className="btn-ghost text-sm">
            {done ? "Yopish" : "Hozir emas"}
          </button>
          {!done && (
            <button onClick={submit} disabled={busy} className="btn-primary text-sm disabled:opacity-50">
              {busy ? "Tekshirilmoqda..." : "Ulash"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

