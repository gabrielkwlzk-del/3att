import type { Metadata } from "next";
import { getAuthContext } from "@/lib/supabase/server";
import { getCheckoutLinks, getManageSubscriptionUrl } from "@/lib/env";
import { getEntitlements } from "@/lib/billing/entitlements";
import { daysLeft, type AccessState } from "@/lib/billing/access";
import { PLANS, TRIAL_DAYS } from "@/lib/billing/plans";
import { PlansView } from "@/components/billing/plans-view";
import { UsageMeter } from "@/components/billing/usage-meter";

export const metadata: Metadata = { title: "Meu plano" };

const dateFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long" });

function headline(state: AccessState, endsAt: Date | null, planName: string): { title: string; text: string } {
  switch (state) {
    case "trial_not_started":
      return { title: `Teste grátis de ${TRIAL_DAYS} dias`, text: "Começa quando você fizer sua primeira pergunta. Sem cartão." };
    case "trial_active":
      return {
        title: `Teste grátis · ${daysLeft(endsAt)} ${daysLeft(endsAt) === 1 ? "dia restante" : "dias restantes"}`,
        text: `Termina em ${endsAt ? dateFmt.format(endsAt) : ""}. Depois disso você fica no plano Semente, a menos que assine.`,
      };
    case "trial_ended":
      return { title: "Seu teste terminou", text: "Você está no plano Semente. Assine para voltar a ter mais perguntas e fotos." };
    case "paid":
      return { title: `Plano ${planName}`, text: endsAt ? `Renova em ${dateFmt.format(endsAt)}.` : "Assinatura ativa." };
    case "grace":
      return { title: `Plano ${planName} · pagamento pendente`, text: "Não conseguimos confirmar o último pagamento. Regularize para não perder o acesso." };
    case "canceled_active":
      return { title: `Plano ${planName} · cancelado`, text: endsAt ? `Você pode usar até ${dateFmt.format(endsAt)}.` : "Cancelado." };
    default:
      return { title: "Plano Semente", text: "Gratuito, com limites mensais." };
  }
}

export default async function PlanPage() {
  const { supabase, user } = await getAuthContext();
  const ent = await getEntitlements(supabase);

  if (!ent.enabled) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pt-6 pb-10 sm:px-6 sm:pt-10">
        <h1 className="text-2xl font-semibold tracking-tight">Meu plano</h1>
        <p className="mt-3 rounded-3xl border border-line bg-surface p-5 text-muted">
          As assinaturas ainda não estão ativas nesta instalação. Enquanto isso, o uso do assistente não tem limite.
        </p>
      </div>
    );
  }

  const { access, usage } = ent;
  const planName = PLANS[access.plan].name;
  const h = headline(access.state, access.endsAt, planName);
  const manageUrl = getManageSubscriptionUrl();
  const isPaid = access.state === "paid" || access.state === "grace" || access.state === "canceled_active";

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pt-6 pb-10 sm:px-6 sm:pt-10">
      <h1 className="text-2xl font-semibold tracking-tight">Meu plano</h1>

      <section className="mt-5 rounded-3xl border border-line bg-surface p-5" aria-labelledby="situacao">
        <h2 id="situacao" className="text-lg font-semibold">{h.title}</h2>
        <p className="mt-1 text-sm text-muted">{h.text}</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <UsageMeter label="Perguntas" used={usage.questions} limit={access.limits.questions} />
          <UsageMeter label="Análises de foto" used={usage.photos} limit={access.limits.photos} />
        </div>
        <p className="mt-3 text-xs text-subtle">
          {access.state === "trial_not_started"
            ? "Os limites do teste valem durante os 3 dias."
            : isPaid
              ? "O uso é renovado a cada mês de assinatura."
              : access.state === "trial_active"
                ? "Os limites do teste valem durante os 3 dias."
                : "O uso é renovado no dia 1º de cada mês."}
        </p>
        {isPaid && manageUrl && (
          <a href={manageUrl} className="mt-4 inline-flex h-11 items-center rounded-full border border-line px-5 text-sm font-medium hover:bg-surface-2">
            Gerenciar ou cancelar assinatura
          </a>
        )}
      </section>

      <section className="mt-8" aria-labelledby="planos">
        <h2 id="planos" className="mb-4 text-lg font-semibold">Planos</h2>
        <PlansView
          currentPlan={
            access.state === "trial_active" || access.state === "trial_not_started" ? null : access.plan
          }
          checkoutLinks={getCheckoutLinks()}
          defaultInterval={ent.subscription?.billing_interval ?? "month"}
          email={user!.email ?? ""}
        />
      </section>
    </div>
  );
}
