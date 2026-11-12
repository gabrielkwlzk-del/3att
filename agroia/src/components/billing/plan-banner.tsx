import Link from "next/link";
import { Hourglass, Sparkles } from "lucide-react";
import type { Access, Usage } from "@/lib/billing/access";
import { daysLeft } from "@/lib/billing/access";
import { TRIAL_DAYS } from "@/lib/billing/plans";

/** Faixa na tela inicial: mostra o teste ou convida a assinar. Sem plano ativo = sem faixa. */
export function PlanBanner({ access, usage }: { access: Access; usage: Usage }) {
  let text: string | null = null;
  switch (access.state) {
    case "trial_not_started":
      text = `Teste grátis de ${TRIAL_DAYS} dias: começa na sua primeira pergunta, sem cartão.`;
      break;
    case "trial_active": {
      const d = daysLeft(access.endsAt);
      const left = Math.max(0, access.limits.questions - usage.questions);
      text = `Teste grátis: ${d} ${d === 1 ? "dia" : "dias"} e ${left} ${left === 1 ? "pergunta restante" : "perguntas restantes"}.`;
      break;
    }
    case "trial_ended":
      text = "Seu teste terminou. Você está no plano Semente; assine para ter mais perguntas e fotos.";
      break;
    case "grace":
      text = "Não confirmamos seu último pagamento. Regularize para não perder o acesso.";
      break;
    case "free": {
      const left = Math.max(0, access.limits.questions - usage.questions);
      text = `Plano Semente: ${left} ${left === 1 ? "pergunta restante" : "perguntas restantes"} neste mês.`;
      break;
    }
    default:
      return null;
  }
  const Icon = access.state === "trial_not_started" || access.state === "trial_active" ? Hourglass : Sparkles;
  return (
    <Link
      href="/plano"
      className="mt-5 flex items-center gap-3 rounded-2xl bg-brand-soft px-4 py-3 text-sm transition hover:brightness-[0.98]"
    >
      <Icon className="size-4 shrink-0 text-brand" aria-hidden />
      <span className="flex-1">{text}</span>
      <span className="shrink-0 font-medium text-brand">Ver planos</span>
    </Link>
  );
}
