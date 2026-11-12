import { createHash, timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseCaktoPayload } from "@/lib/billing/cakto";
import { applyBillingEvent } from "@/lib/billing/apply-event";

/**
 * Webhook da Cakto.
 *
 * Autenticação: a URL cadastrada na Cakto deve incluir o segredo:
 *   https://SEU-DOMINIO/api/webhooks/cakto?token=<CAKTO_WEBHOOK_TOKEN>
 * (o token também é aceito no cabeçalho `x-webhook-token`). Se a Cakto oferecer assinatura
 * HMAC do corpo, prefira validá-la aqui além do token.
 *
 * Todo evento recebido é guardado em billing_events (corpo bruto) antes de qualquer processamento.
 */

function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export async function POST(request: Request) {
  const expected = serverEnv.caktoWebhookToken;
  if (!expected || !serverEnv.supabaseServiceRoleKey) {
    return Response.json({ error: "Webhook não configurado." }, { status: 503 });
  }
  const url = new URL(request.url);
  const given = url.searchParams.get("token") ?? request.headers.get("x-webhook-token") ?? "";
  if (!given || !safeEqual(given, expected)) {
    return Response.json({ error: "Não autorizado." }, { status: 401 });
  }

  const rawText = await request.text();
  if (rawText.length > 256 * 1024) return Response.json({ error: "Corpo grande demais." }, { status: 413 });
  let payload: unknown;
  try {
    payload = JSON.parse(rawText);
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  const admin = createAdminClient();
  const event = parseCaktoPayload(payload);
  // Sem mapeamento, o hash do corpo identifica reenvios idênticos.
  const eventId = event?.eventId ?? `sha256:${createHash("sha256").update(rawText).digest("hex")}`;

  const { error: insertError } = await admin.from("billing_events").insert({
    provider: "cakto",
    event_id: eventId,
    kind: event?.kind ?? null,
    email: event?.email?.toLowerCase() ?? null,
    note: event ? null : "unmapped",
    raw: payload as object,
  });

  if (insertError) {
    if (insertError.code === "23505") {
      // Já recebido. Se não foi processado com sucesso, tenta de novo; senão é só um reenvio.
      const { data: existing } = await admin
        .from("billing_events")
        .select("processed_at")
        .eq("provider", "cakto")
        .eq("event_id", eventId)
        .maybeSingle();
      if (existing?.processed_at || !event) return Response.json({ received: true, duplicate: true });
    } else {
      console.error("[cakto] falha ao registrar evento:", insertError.message);
      return Response.json({ error: "Falha ao registrar evento." }, { status: 500 });
    }
  }

  if (!event) return Response.json({ received: true, mapped: false });

  const result = await applyBillingEvent(admin, event);
  const failureNote = result.ok
    ? null
    : result.reason === "user_not_found"
      ? "user_not_found"
      : `error: ${result.reason}${result.detail ? ` (${result.detail})` : ""}`;
  await admin
    .from("billing_events")
    .update(
      result.ok
        ? { user_id: result.userId, note: null, processed_at: new Date().toISOString() }
        : { note: failureNote },
    )
    .eq("provider", "cakto")
    .eq("event_id", eventId);

  if (!result.ok && result.reason === "db_error") {
    // 500 faz o gateway reenviar o aviso depois.
    return Response.json({ error: "Falha ao aplicar o evento." }, { status: 500 });
  }
  // user_not_found e invalid_event: registrados, sem reenvio (reenviar não resolve sozinho).
  return Response.json({ received: true, applied: result.ok });
}

/** Alguns provedores testam a URL com GET. */
export async function GET() {
  return Response.json({ ok: true });
}
