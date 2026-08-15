// Qurilmani (brauzerni) barqaror, ammo shaxsiy ma'lumotsiz aniqlash.
const KEY = "linny_device_id";

function randomId() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

/** Brauzerda saqlanadigan tasodifiy qurilma ID'si. */
export function deviceFingerprint(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    const existing = window.localStorage.getItem(KEY);
    if (existing && existing.length >= 8) return existing;
    const id = randomId();
    window.localStorage.setItem(KEY, id);
    return id;
  } catch {
    return randomId();
  }
}

/** Foydalanuvchiga ko'rsatiladigan qisqa qurilma nomi. */
export function deviceLabel(): string {
  if (typeof navigator === "undefined") return "Noma'lum qurilma";
  const ua = navigator.userAgent;
  const os = /Android/i.test(ua)
    ? "Android"
    : /iPhone|iPad|iPod/i.test(ua)
      ? "iPhone/iPad"
      : /Windows/i.test(ua)
        ? "Windows"
        : /Mac OS/i.test(ua)
          ? "Mac"
          : /Linux/i.test(ua)
            ? "Linux"
            : "Boshqa";
  const br = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : /Firefox\//.test(ua)
            ? "Firefox"
            : "Brauzer";
  return `${os} · ${br}`;
}
