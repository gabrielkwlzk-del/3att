import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { getEntitlements } from "@/lib/billing/entitlements";
import { daysLeft } from "@/lib/billing/access";
import { PLANS } from "@/lib/billing/plans";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await getAuthContext();
  if (!user) redirect("/entrar");

  const ent = await getEntitlements(supabase);
  let planBadge: string | null = null;
  if (ent.enabled) {
    const { state, plan, endsAt } = ent.access;
    planBadge =
      state === "trial_not_started"
        ? "Teste grátis"
        : state === "trial_active"
          ? `Teste · ${daysLeft(endsAt)}d`
          : state === "trial_ended" || state === "free"
            ? "Semente"
            : PLANS[plan].name;
  }
  return (
    <AppShell userEmail={user.email ?? ""} planBadge={planBadge}>
      {children}
    </AppShell>
  );
}
