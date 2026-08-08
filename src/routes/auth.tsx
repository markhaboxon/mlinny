import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import LoginForm from "@/components/LoginForm";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Kirish — Linny" },
      { name: "description", content: "Login va parol orqali Linny tizimiga kiring." },
      { property: "og:title", content: "Kirish — Linny" },
      { property: "og:description", content: "Login va parol orqali Linny tizimiga kiring." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/" });
    });
  }, [navigate]);

  return <LoginForm />;
}
