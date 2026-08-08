import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { myAccess } from "@/lib/access.functions";
import { HOME_FOR } from "@/lib/auth-config";

export type AccountKind = "admin" | "teacher" | "student" | "user";

/** `undefined` = hali aniqlanmagan, `null` = kirilmagan. */
function useSessionUser() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);
  return user;
}

/**
 * Route darajasidagi rol tekshiruvi. Rol mos kelmasa — render qilishdan oldin
 * foydalanuvchi o'z roliga tegishli asosiy sahifaga qaytariladi.
 */
export function useRequireRole(allowed: AccountKind[]) {
  const user = useSessionUser();
  const navigate = useNavigate();
  const access = useServerFn(myAccess);

  const { data, isLoading } = useQuery({
    queryKey: ["my-access"],
    queryFn: () => access(),
    enabled: !!user,
    staleTime: 30_000,
  });

  const kind = data?.kind as AccountKind | undefined;
  const ok = !!kind && allowed.includes(kind);

  useEffect(() => {
    if (user === undefined) return;
    if (user === null) {
      navigate({ to: "/auth", replace: true });
      return;
    }
    if (!kind) return;
    if (!allowed.includes(kind)) {
      navigate({ to: HOME_FOR[kind] ?? "/", replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, kind, navigate]);

  const state: "loading" | "denied" | "ok" =
    user === undefined || (!!user && (isLoading || !kind)) ? "loading" : ok ? "ok" : "denied";

  return { state, kind, user: user ?? null, access: data ?? null };
}