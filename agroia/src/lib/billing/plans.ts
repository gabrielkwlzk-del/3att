/**
 * Planos, preços, limites e regras do teste grátis.
 * Arquivo único para ajustar valores: nada aqui é secreto (usado no servidor e no navegador).
 *
 * Valores em CENTAVOS. Estimativas de custo de IA e margem: docs/ASSINATURAS.md.
 */

export type PlanId = "semente" | "produtor" | "fazenda";
export type Interval = "month" | "year";

/**
 * Duração do teste. Mantenha igual ao `interval '3 days'` da função
 * public.start_trial() em supabase/migrations/20261113000000_billing.sql.
 */
export const TRIAL_DAYS = 3;

/** Dias de tolerância depois do fim do período pago (pagamento atrasado ou aviso do gateway que não chegou). */
export const GRACE_DAYS = 3;

/** O teste libera os recursos do plano Produtor, com limites menores para conter o custo de IA. */
export const TRIAL = {
  plan: "produtor" as PlanId,
  questions: 15,
  photos: 3,
};

export type PlanDef = {
  id: PlanId;
  name: string;
  tagline: string;
  /** null = gratuito */
  priceCents: { month: number; year: number } | null;
  limits: { questions: number; photos: number };
  /** O que o plano entrega hoje, no app. */
  highlights: string[];
  /** Prometido em planos, mas ainda NÃO implementado: aparece com selo "Em breve". */
  comingSoon: string[];
};

export const PLANS: Record<PlanId, PlanDef> = {
  semente: {
    id: "semente",
    name: "Semente",
    tagline: "Para conhecer e tirar dúvidas pontuais",
    priceCents: null,
    limits: { questions: 10, photos: 2 },
    highlights: [
      "10 perguntas por mês",
      "2 análises de foto por mês",
      "Clima, alertas e janelas de pulverização",
      "Voz pelo navegador",
    ],
    comingSoon: [],
  },
  produtor: {
    id: "produtor",
    name: "Produtor",
    tagline: "Para o agricultor familiar e o pequeno produtor",
    priceCents: { month: 3990, year: 39900 }, // R$ 39,90/mês · R$ 399/ano (~R$ 33,25/mês)
    limits: { questions: 100, photos: 20 },
    highlights: [
      "100 perguntas por mês",
      "20 análises de foto por mês",
      "Referências de fontes oficiais",
      "Respostas em áudio",
      "Histórico ilimitado",
    ],
    comingSoon: [],
  },
  fazenda: {
    id: "fazenda",
    name: "Fazenda",
    tagline: "Para o médio e o grande produtor",
    priceCents: { month: 14990, year: 149900 }, // R$ 149,90/mês · R$ 1.499/ano (~R$ 124,92/mês)
    limits: { questions: 400, photos: 60 },
    highlights: [
      "400 perguntas por mês",
      "60 análises de foto por mês",
      "Tudo do plano Produtor",
      "Atendimento prioritário",
    ],
    // Ainda não existem no app. Não anuncie como disponível enquanto não forem construídos.
    comingSoon: ["Até 5 propriedades", "3 pessoas da equipe", "Atendimento pelo WhatsApp"],
  },
};

export const PAID_PLANS: PlanId[] = ["produtor", "fazenda"];

export function isPlanId(value: unknown): value is PlanId {
  return value === "semente" || value === "produtor" || value === "fazenda";
}

export function formatBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

/** Preço mensal equivalente do plano anual, em centavos. */
export function yearlyPerMonthCents(plan: PlanDef): number | null {
  return plan.priceCents ? Math.round(plan.priceCents.year / 12) : null;
}

/** Economia do anual frente a 12 meses no mensal, em %. */
export function yearlySavingsPercent(plan: PlanDef): number | null {
  if (!plan.priceCents) return null;
  const full = plan.priceCents.month * 12;
  return Math.round(((full - plan.priceCents.year) / full) * 100);
}
