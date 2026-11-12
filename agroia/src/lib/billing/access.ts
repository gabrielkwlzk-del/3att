import { GRACE_DAYS, PLANS, TRIAL, TRIAL_DAYS, type Interval, type PlanId } from "./plans";

/**
 * Regra de acesso, como função pura (sem banco nem relógio global): recebe a linha
 * da assinatura e "agora" e devolve o que o usuário pode usar. Não depende de cron:
 * fim de teste, atraso e cancelamento são calculados pelas datas.
 */

export type SubscriptionRow = {
  plan: PlanId;
  status: "trialing" | "active" | "past_due" | "canceled" | "expired";
  billing_interval: Interval | null;
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  canceled_at: string | null;
};

export type AccessState =
  | "trial_not_started" // teste disponível, ainda não começou (começa na 1ª pergunta)
  | "trial_active"
  | "trial_ended" // teste acabou sem assinatura → plano Semente
  | "paid"
  | "grace" // pagamento atrasado, dentro da tolerância
  | "canceled_active" // cancelou, mas o período pago ainda não acabou
  | "free"; // Semente (assinatura vencida, expirada ou estornada)

export type Access = {
  state: AccessState;
  /** Plano efetivo agora (define limites e modelo de IA). */
  plan: PlanId;
  limits: { questions: number; photos: number };
  /** Início da janela em que perguntas e fotos são contadas. */
  periodStart: Date;
  /** Fim do teste ou do período pago, quando existir. */
  endsAt: Date | null;
  interval: Interval | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function addMonthsUTC(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

/** Janela mensal ancorada na data de início (planos anuais também têm limite mensal). */
export function anchoredMonthStart(anchor: Date, now: Date): Date {
  let start = anchor;
  for (let i = 0; i < 36; i++) {
    const next = addMonthsUTC(anchor, i + 1);
    if (next.getTime() > now.getTime()) break;
    start = next;
  }
  return start.getTime() > now.getTime() ? now : start;
}

/** Primeiro instante do mês corrente em Brasília (UTC−3, sem horário de verão desde 2019). */
export function calendarMonthStartBR(now: Date): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")!.value);
  const month = Number(parts.find((p) => p.type === "month")!.value);
  return new Date(Date.UTC(year, month - 1, 1, 3, 0, 0));
}

function freeAccess(state: AccessState, now: Date): Access {
  return {
    state,
    plan: "semente",
    limits: PLANS.semente.limits,
    periodStart: calendarMonthStartBR(now),
    endsAt: null,
    interval: null,
  };
}

export function resolveAccess(sub: SubscriptionRow | null, now: Date = new Date()): Access {
  if (!sub) return freeAccess("free", now);

  const periodEnd = sub.current_period_end ? new Date(sub.current_period_end) : null;
  const periodStartRaw = sub.current_period_start ? new Date(sub.current_period_start) : null;

  const paidAccess = (state: AccessState): Access => ({
    state,
    plan: sub.plan === "semente" ? "produtor" : sub.plan,
    limits: PLANS[sub.plan === "semente" ? "produtor" : sub.plan].limits,
    periodStart: periodStartRaw ? anchoredMonthStart(periodStartRaw, now) : calendarMonthStartBR(now),
    endsAt: periodEnd,
    interval: sub.billing_interval,
  });

  switch (sub.status) {
    case "trialing": {
      if (!sub.trial_ends_at) {
        return {
          state: "trial_not_started",
          plan: TRIAL.plan,
          limits: { questions: TRIAL.questions, photos: TRIAL.photos },
          periodStart: now,
          endsAt: null,
          interval: null,
        };
      }
      const end = new Date(sub.trial_ends_at);
      if (end.getTime() > now.getTime()) {
        return {
          state: "trial_active",
          plan: TRIAL.plan,
          limits: { questions: TRIAL.questions, photos: TRIAL.photos },
          periodStart: new Date(end.getTime() - TRIAL_DAYS * DAY_MS),
          endsAt: end,
          interval: null,
        };
      }
      return { ...freeAccess("trial_ended", now), endsAt: end };
    }

    case "active":
      // Se o aviso de renovação não chegar, o acesso acaba após o período + tolerância.
      if (periodEnd && now.getTime() > periodEnd.getTime() + GRACE_DAYS * DAY_MS) return freeAccess("free", now);
      return paidAccess("paid");

    case "past_due":
      if (periodEnd && now.getTime() <= periodEnd.getTime() + GRACE_DAYS * DAY_MS) return paidAccess("grace");
      return freeAccess("free", now);

    case "canceled":
      // Cancelou: usa até o fim do período que já foi pago.
      if (periodEnd && now.getTime() <= periodEnd.getTime()) return paidAccess("canceled_active");
      return freeAccess("free", now);

    case "expired":
    default:
      return freeAccess("free", now);
  }
}

export type Usage = { questions: number; photos: number };

export type QuotaCheck =
  | { ok: true }
  | { ok: false; code: "questions_exhausted" | "photos_exhausted" | "photos_not_enough"; message: string };

/** Confere se ainda dá para enviar mais uma pergunta (com `newPhotos` fotos). */
export function checkQuota(access: Access, usage: Usage, newPhotos: number): QuotaCheck {
  const inTrial = access.state === "trial_active" || access.state === "trial_not_started";
  const afterTrial = access.state === "trial_ended";
  const what = inTrial ? "do seu teste grátis" : afterTrial ? "do plano Semente neste mês" : "do seu plano neste período";
  const next = inTrial || afterTrial ? "Assine para continuar." : "Faça upgrade para continuar.";
  const prefix = afterTrial ? "Seu teste grátis terminou. " : "";

  if (usage.questions >= access.limits.questions) {
    return {
      ok: false,
      code: "questions_exhausted",
      message: `${prefix}Você usou as ${access.limits.questions} perguntas ${what}. ${next}`,
    };
  }
  if (newPhotos > 0) {
    const left = access.limits.photos - usage.photos;
    if (left <= 0) {
      return {
        ok: false,
        code: "photos_exhausted",
        message: `${prefix}Você usou as ${access.limits.photos} análises de foto ${what}. Envie sua pergunta sem foto ou ${next.toLowerCase()}`,
      };
    }
    if (newPhotos > left) {
      return {
        ok: false,
        code: "photos_not_enough",
        message: `Você ainda tem ${left} ${left === 1 ? "análise de foto" : "análises de foto"} ${what}. Envie menos fotos nesta mensagem.`,
      };
    }
  }
  return { ok: true };
}

/** Dias inteiros restantes (arredonda para cima; 0 se já acabou). */
export function daysLeft(endsAt: Date | null, now: Date = new Date()): number {
  if (!endsAt) return 0;
  return Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / DAY_MS));
}
