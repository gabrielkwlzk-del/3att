import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BillingEvent } from "./cakto";

const DAY_MS = 24 * 60 * 60 * 1000;

function addInterval(from: Date, interval: "month" | "year"): Date {
  const d = new Date(from.getTime());
  if (interval === "year") d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

export type ApplyResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "user_not_found" | "invalid_event" | "db_error"; detail?: string };

/** Aplica um evento de cobrança já normalizado à assinatura do usuário (chave de serviço). */
export async function applyBillingEvent(admin: SupabaseClient, event: BillingEvent, now = new Date()): Promise<ApplyResult> {
  const email = event.email.trim().toLowerCase();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (profileError) return { ok: false, reason: "db_error", detail: profileError.message };
  if (!profile) return { ok: false, reason: "user_not_found" };
  const userId = profile.id as string;

  const base = { external_provider: "cakto", external_subscription_id: event.externalSubscriptionId ?? null };
  let patch: Record<string, unknown>;

  switch (event.kind) {
    case "activated":
    case "renewed": {
      if (!event.plan || !event.interval) return { ok: false, reason: "invalid_event", detail: "plano/periodicidade ausentes" };
      patch = {
        ...base,
        plan: event.plan,
        status: "active",
        billing_interval: event.interval,
        current_period_start: now.toISOString(),
        current_period_end: (event.periodEnd ?? addInterval(now, event.interval)).toISOString(),
        canceled_at: null,
      };
      break;
    }
    case "past_due":
      patch = { ...base, status: "past_due" };
      break;
    case "canceled":
      // Mantém plan e current_period_end: o acesso vai até o fim do período já pago.
      patch = { ...base, status: "canceled", canceled_at: now.toISOString() };
      break;
    case "refunded":
      patch = { ...base, status: "expired", current_period_end: new Date(now.getTime() - DAY_MS).toISOString() };
      break;
  }

  // Garante a linha (usuários criados antes da migração) e aplica o evento.
  const { error } = await admin.from("subscriptions").upsert({ user_id: userId, ...patch }, { onConflict: "user_id" });
  if (error) return { ok: false, reason: "db_error", detail: error.message };
  return { ok: true, userId };
}
