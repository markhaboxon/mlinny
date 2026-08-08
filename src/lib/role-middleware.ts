import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Faqat ustoz roli. Server tomonda ham rol tekshiriladi (UI'ga ishonmaymiz). */
export const requireTeacher = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { requireKind } = await import("./access.server");
    await requireKind(context.userId, ["teacher"]);
    return next();
  });

/** Guruhga tegishli o'quvchi funksiyalari — faqat o'quvchi roli. */
export const requireStudent = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { requireKind } = await import("./access.server");
    await requireKind(context.userId, ["student"]);
    return next();
  });