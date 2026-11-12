import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";
import { checkQuota, resolveAccess, type Access, type QuotaCheck, type SubscriptionRow, type Usage } from "./access";
import type { PlanId } from "./plans";

export type Entitlements = {
  /** false = assinaturas desligadas: ninguém é limitado e nada de plano aparece na tela. */
  enabled: boolean;
  access: Access;
  usage: Usage;
  subscription: SubscriptionRow | null;
};

const UNLIMITED: Access = {
  state: "paid",
  plan: "fazenda",
  limits: { questions: Number.MAX_SAFE_INTEGER, photos: Number.MAX_SAFE_INTEGER },
  periodStart: new Date(0),
  endsAt: null,
  interval: null,
};

export async function getEntitlements(supabase: SupabaseClient): Promise<Entitlements> {
  if (!serverEnv.billingEnabled) {
    return { enabled: false, access: UNLIMITED, usage: { questions: 0, photos: 0 }, subscription: null };
  }

  const { data, error } = await supabase
    .from("subscriptions")
    .select("plan, status, billing_interval, trial_ends_at, current_period_start, current_period_end, canceled_at")
    .maybeSingle();
  if (error) console.error("[billing] falha ao ler assinatura:", error.message);

  const subscription = (data as SubscriptionRow | null) ?? null;
  const access = resolveAccess(subscription);

  let usage: Usage = { questions: 0, photos: 0 };
  if (access.state !== "trial_not_started") {
    const { data: rows, error: usageError } = await supabase.rpc("usage_since", {
      p_since: access.periodStart.toISOString(),
    });
    if (usageError) console.error("[billing] falha ao contar uso:", usageError.message);
    const row = (rows as { questions: number; photos: number }[] | null)?.[0];
    if (row) usage = { questions: row.questions ?? 0, photos: row.photos ?? 0 };
  }
  return { enabled: true, access, usage, subscription };
}

/** Inicia o relógio dos 3 dias (idempotente) e devolve os direitos atualizados. */
export async function startTrialIfNeeded(supabase: SupabaseClient, current: Entitlements): Promise<Entitlements> {
  if (!current.enabled || current.access.state !== "trial_not_started") return current;
  const { error } = await supabase.rpc("start_trial");
  if (error) {
    console.error("[billing] falha ao iniciar teste:", error.message);
    return current;
  }
  return getEntitlements(supabase);
}

export function gateMessage(ent: Entitlements, newPhotos: number): QuotaCheck {
  if (!ent.enabled) return { ok: true };
  return checkQuota(ent.access, ent.usage, newPhotos);
}

/** Modelo de IA por plano. Foto usa o modelo de visão; vazio cai em AI_MODEL. */
export function pickModel(plan: PlanId, hasPhotos: boolean): string {
  // Sem assinaturas ligadas, o comportamento do chat não muda: sempre AI_MODEL.
  if (!serverEnv.billingEnabled) return serverEnv.aiModel;
  const byPlan = { semente: serverEnv.aiModelSemente, produtor: serverEnv.aiModelProdutor, fazenda: serverEnv.aiModelFazenda };
  if (hasPhotos && serverEnv.aiModelVision) return serverEnv.aiModelVision;
  return byPlan[plan] || serverEnv.aiModel;
}
