/**
 * Google (OAuth) sign-in is PAUSED, not removed.
 * Flip this to `true` to bring the Google button back everywhere —
 * `src/integrations/lovable/index.ts` is untouched and still works.
 */
export const GOOGLE_AUTH_ENABLED = false;

/** Synthetic e-mail used behind the scenes for login/parol accounts. */
export const EMAIL_DOMAIN = "linny.local";

/**
 * Logins are stored and matched in a normalized form: lowercase, without
 * apostrophes or spaces. That way `O'quvchi`, `oquvchi` and `O’QUVCHI`
 * all reach the same account, while the synthetic e-mail stays valid.
 */
export function normalizeLogin(login: string) {
  return login
    .trim()
    .toLowerCase()
    .replace(/['’‘`\s]/g, "");
}

export function emailOf(login: string) {
  return `${normalizeLogin(login)}@${EMAIL_DOMAIN}`;
}

export const ADMIN_CONTACT = {
  telegram: "qiziqyabsizmi",
  email: "akramxonsaidov01@gmail.com",
};

export const KIND_LABEL: Record<string, string> = {
  admin: "Admin",
  teacher: "Ustoz",
  student: "O'quvchi",
  user: "Foydalanuvchi",
};

/** Har bir rol uchun asosiy (default) sahifa. */
export const HOME_FOR: Record<string, string> = {
  admin: "/admin",
  teacher: "/teacher",
  student: "/",
  user: "/",
};
