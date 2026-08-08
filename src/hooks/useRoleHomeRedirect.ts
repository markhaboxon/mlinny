import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { myAccess } from "@/lib/access.functions";
import { HOME_FOR } from "@/lib/auth-config";

/**
 * Kirgan foydalanuvchining roli bu sahifaga mos kelmasa — o'z rolining
 * asosiy sahifasiga qaytaradi. Kirmagan foydalanuvchiga tegmaydi.
 */
export function useRoleHomeRedirect(allowed: string[], enabled: boolean) {
  const navigate = useNavigate();
  const access = useServerFn(myAccess);
  const { data } = useQuery({
    queryKey: ["my-access"],
    queryFn: () => access(),
    enabled,
    staleTime: 30_000,
  });
  const kind = data?.kind;
  useEffect(() => {
    if (!kind || allowed.includes(kind)) return;
    navigate({ to: HOME_FOR[kind] ?? "/", replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, navigate]);
  return kind;
}