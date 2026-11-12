"use client";

import { useState } from "react";
import { Check, Clock, Sparkles } from "lucide-react";
import {
  PAID_PLANS,
  PLANS,
  TRIAL_DAYS,
  formatBRL,
  yearlyPerMonthCents,
  yearlySavingsPercent,
  type Interval,
  type PlanId,
} from "@/lib/billing/plans";

type Props = {
  /** null durante o teste: nenhum plano é "o atual". */
  currentPlan: PlanId | null;
  /** Links de checkout configurados (Cakto). Plano sem link aparece como "em breve". */
  checkoutLinks: Partial<Record<`${"produtor" | "fazenda"}_${Interval}`, string>>;
  defaultInterval: Interval;
  email: string;
};

export function PlansView({ currentPlan, checkoutLinks, defaultInterval, email }: Props) {
  const [interval, setInterval] = useState<Interval>(defaultInterval);
  const savings = yearlySavingsPercent(PLANS.produtor);

  return (
    <div>
      <div className="mx-auto grid w-fit grid-cols-2 rounded-full bg-surface-2 p-1" role="tablist" aria-label="Periodicidade">
        {(["month", "year"] as const).map((i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={interval === i}
            onClick={() => setInterval(i)}
            className={`h-10 rounded-full px-5 text-sm font-medium transition ${interval === i ? "bg-surface text-fg shadow-sm" : "text-muted"}`}
          >
            {i === "month" ? "Mensal" : "Anual"}
            {i === "year" && savings ? <span className="ml-1.5 text-xs font-semibold text-leaf">-{savings}%</span> : null}
          </button>
        ))}
      </div>

      <ul className="mt-6 grid gap-3 lg:grid-cols-3">
        {(["semente", ...PAID_PLANS] as const).map((id) => {
          const plan = PLANS[id];
          const isCurrent = currentPlan === id;
          const featured = id === "produtor";
          const link = id === "semente" ? undefined : checkoutLinks[`${id}_${interval}`];
          const price = plan.priceCents;
          return (
            <li
              key={id}
              className={`flex flex-col rounded-3xl border p-5 ${featured ? "border-brand bg-brand-soft/40 shadow-card" : "border-line bg-surface"}`}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">{plan.name}</h3>
                {featured && (
                  <span className="rounded-full bg-brand px-2.5 py-0.5 text-xs font-medium text-brand-fg">Mais escolhido</span>
                )}
              </div>
              <p className="mt-1 text-sm text-muted">{plan.tagline}</p>

              <p className="mt-4">
                {price ? (
                  <>
                    <span className="text-3xl font-semibold tracking-tight">
                      {formatBRL(interval === "month" ? price.month : yearlyPerMonthCents(plan)!)}
                    </span>
                    <span className="text-sm text-muted"> /mês</span>
                  </>
                ) : (
                  <span className="text-3xl font-semibold tracking-tight">Grátis</span>
                )}
              </p>
              <p className="h-5 text-xs text-subtle">
                {price && interval === "year" ? `${formatBRL(price.year)} cobrados uma vez por ano` : ""}
              </p>

              <ul className="mt-3 space-y-2 text-sm">
                {plan.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-leaf" aria-hidden /> {h}
                  </li>
                ))}
                {plan.comingSoon.map((h) => (
                  <li key={h} className="flex items-start gap-2 text-muted">
                    <Clock className="mt-0.5 size-4 shrink-0 text-subtle" aria-hidden />
                    <span>
                      {h} <span className="ml-1 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium">Em breve</span>
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-auto pt-5">
                {isCurrent ? (
                  <span className="flex h-11 items-center justify-center rounded-full bg-surface-2 text-sm font-medium text-muted">
                    Seu plano atual
                  </span>
                ) : id === "semente" ? null : link ? (
                  <a
                    href={link}
                    className="flex h-11 items-center justify-center gap-2 rounded-full bg-brand text-sm font-medium text-brand-fg transition hover:bg-brand-strong active:scale-[0.99]"
                  >
                    <Sparkles className="size-4" aria-hidden /> Assinar {plan.name}
                  </a>
                ) : (
                  <span className="flex h-11 items-center justify-center rounded-full border border-line text-sm text-muted" aria-disabled="true">
                    Assinatura em breve
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-5 rounded-2xl bg-wheat-soft p-3.5 text-sm">
        No pagamento, use o <strong>mesmo e-mail da sua conta</strong> ({email}). É por ele que liberamos o seu plano.
      </p>
      <p className="mt-3 text-xs text-subtle">
        Teste grátis de {TRIAL_DAYS} dias, sem cartão, que começa na sua primeira pergunta. Cancele quando quiser pelo mesmo
        canal da compra; o acesso continua até o fim do período já pago. Compras online têm direito de arrependimento de 7 dias.
      </p>
    </div>
  );
}
