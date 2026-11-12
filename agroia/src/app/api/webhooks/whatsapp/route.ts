import { serverEnv } from "@/lib/env";

/**
 * Ponto de entrada reservado para a integração com a WhatsApp Cloud API (Meta).
 * Desligado por padrão (WHATSAPP_ENABLED=false). Veja docs/ARQUITETURA.md,
 * seção "Integração futura com WhatsApp", para o fluxo previsto:
 *   1. Verificar assinatura X-Hub-Signature-256 com WHATSAPP_APP_SECRET.
 *   2. Localizar o usuário em channel_identities pelo telefone verificado.
 *   3. Reutilizar runAssistant() (src/lib/ai/assistant.ts) — o mesmo motor do app web.
 *   4. Responder pela Graph API.
 */

/** Verificação do webhook (handshake da Meta). */
export async function GET(request: Request) {
  if (!serverEnv.whatsappEnabled || !serverEnv.whatsappVerifyToken) {
    return new Response("Integração com WhatsApp não habilitada.", { status: 404 });
  }
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token === serverEnv.whatsappVerifyToken && challenge) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("Token de verificação inválido.", { status: 403 });
}

export async function POST() {
  return Response.json(
    { error: "Recebimento de mensagens do WhatsApp ainda não implementado." },
    { status: 501 },
  );
}
