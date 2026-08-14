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

const GUIDE: { title: string; steps: string[] }[] = [
  {
    title: "1-qadam. Google hisobingizga kiring",
    steps: [
      "Telefon yoki kompyuterda brauzerni oching (Chrome bo'lsa yaxshi).",
      "Gmail hisobingizga kirgan bo'ling. Kirmagan bo'lsangiz, avval Gmail'ga kiring.",
    ],
  },
  {
    title: "2-qadam. Google AI Studio saytini oching",
    steps: [
      "Yuqoridagi \"Google AI Studio dan kalit olish\" havolasini bosing (yoki aistudio.google.com/apikey manzilini yozing).",
      "Sayt ochilganda \"Sign in\" chiqsa, Gmail hisobingizni tanlang.",
      "Birinchi marta kirsangiz, shartlarga rozilik oynasi chiqadi — \"I agree\" / \"Men roziman\" degan katakchani belgilab, \"Continue\" tugmasini bosing.",
    ],
  },
  {
    title: "3-qadam. Yangi kalit yarating",
    steps: [
      "Sahifadagi ko'k \"Create API key\" (API kalit yaratish) tugmasini bosing.",
      "Agar \"Select a project\" / loyiha tanlash so'ralsa, ro'yxatdan istalgan loyihani tanlang yoki \"Create project\" ni bosib yangi loyiha yarating (nom sifatida masalan: linny).",
      "So'ng yana \"Create API key in existing project\" tugmasini bosing.",
      "Bir necha soniyada uzun kalit paydo bo'ladi. U odatda AIza... bilan boshlanadi.",
    ],
  },
  {
    title: "4-qadam. Kalitni nusxalang",
    steps: [
      "Kalit yonidagi nusxalash belgisini (ikkita ustma-ust turgan kvadrat 🗐) bosing — kalit telefoningiz xotirasiga ko'chiriladi.",
      "Belgi ko'rinmasa: kalit ustiga barmog'ingizni bosib turing → \"Copy\" / \"Nusxalash\" ni tanlang.",
      "Kalitni hech kimga bermang: u sizning shaxsiy kalitingiz.",
    ],
  },
  {
    title: "5-qadam. Shu yerga joylashtiring",
    steps: [
      "Linny'ga qayting va shu oynadagi bo'sh katakchani bosing.",
      "Barmog'ingizni katakcha ustida bosib turing → \"Paste\" / \"Joylashtirish\" ni tanlang (kompyuterda Ctrl+V).",
      "\"Ulash\" tugmasini bosing. Bir-ikki soniya tekshiriladi.",
      "\"Kalit ulandi\" degan yashil yozuv chiqsa — hammasi tayyor! ✅",
    ],
  },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "Kalit pullikmi?",
    a: "Yo'q. Google AI Studio bepul kalit beradi. Faqat kunlik/daqiqalik cheklov bor — cheklov tugasa, tizim boshqa kalitga o'tadi yoki 1-2 daqiqadan keyin yana ishlaydi.",
  },
  {
    q: "Kalitim boshqalarga ko'rinadimi?",
    a: "Yo'q. Siz qo'shgan kalit faqat sizning mashg'ulotlaringizda ishlatiladi va saytda to'liq ko'rinmaydi.",
  },
  {
    q: "\"Bu kalit avval kiritilgan\" desa nima qilay?",
    a: "Demak shu kalit tizimda allaqachon bor. Google AI Studio'da \"Create API key\" ni bosib yangi kalit yarating va shuni kiriting.",
  },
  {
    q: "Kalit ishlamadi desa?",
    a: "Kalitni to'liq nusxalaganingizni tekshiring (boshi AIza..., bo'sh joy yoki tushib qolgan harf bo'lmasin). Kerak bo'lsa yangi kalit yarating.",
  },
];

function Dialog({ exhausted, onClose }: { exhausted: boolean; onClose: () => void }) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
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
        setDone(true);
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
              Google AI Studio dan olgan Gemini API kalitingizni kiriting — u faqat sizning
              mashg'ulotlaringiz uchun ishlatiladi.
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
            onClick={() => setGuide((v) => !v)}
            className="text-sm font-semibold text-primary hover:underline"
          >
            {guide ? "📘 Yo'riqnomani yopish" : "📘 Yo'riqnoma — qanday olish kerak?"}
          </button>
        </div>

        {guide && (
          <div className="mt-3 rounded-xl border border-border bg-muted/40 p-4 text-sm space-y-4">
            <p className="text-muted-foreground">
              Quyidagi qadamlarni birma-bir bajaring. Hech qanday texnik bilim kerak emas — 2-3 daqiqa
              vaqt oladi.
            </p>
            {GUIDE.map((g) => (
              <div key={g.title}>
                <div className="font-semibold">{g.title}</div>
                <ul className="mt-1 space-y-1 list-disc pl-5 text-muted-foreground">
                  {g.steps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            ))}
            <div>
              <div className="font-semibold">Ko'p beriladigan savollar</div>
              <ul className="mt-1 space-y-2 text-muted-foreground">
                {FAQ.map((f) => (
                  <li key={f.q}>
                    <span className="font-medium text-foreground">{f.q}</span> — {f.a}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {done ? (
          <div className="mt-4 p-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-sm">
            ✅ Kalit qabul qilindi! U faqat sizning hisobingiz uchun ishlatiladi.
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

