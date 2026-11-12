import "server-only";

/**
 * Leitura centralizada das variáveis de ambiente do servidor.
 * Nenhuma chave secreta sai deste módulo para o navegador: o cliente só
 * recebe os "recursos disponíveis" (booleans) via getPublicCapabilities().
 */

function readBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  return ["1", "true", "yes", "sim", "on"].includes(value.trim().toLowerCase());
}

function readInt(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORTS)[number];

export const serverEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",

  aiProvider: (process.env.AI_PROVIDER ?? "anthropic").trim().toLowerCase(),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  aiModel: (process.env.AI_MODEL ?? "claude-opus-5-5").trim(),
  aiEffort: (EFFORTS as readonly string[]).includes(process.env.AI_EFFORT ?? "")
    ? (process.env.AI_EFFORT as Effort)
    : ("medium" as Effort),
  aiRefusalFallback: readBool(process.env.AI_REFUSAL_FALLBACK, true),
  aiWebSearch: readBool(process.env.AI_WEB_SEARCH, false),
  aiWebSearchMaxUses: readInt(process.env.AI_WEB_SEARCH_MAX_USES, 3, 1, 10),

  voyageApiKey: process.env.VOYAGE_API_KEY ?? "",
  voyageModel: (process.env.VOYAGE_MODEL ?? "voyage-3.5").trim(),

  elevenLabsApiKey: process.env.ELEVENLABS_API_KEY ?? "",
  elevenLabsSttModel: (process.env.ELEVENLABS_STT_MODEL ?? "scribe_v1").trim(),
  elevenLabsTtsModel: (process.env.ELEVENLABS_TTS_MODEL ?? "eleven_multilingual_v2").trim(),
  elevenLabsVoiceId: (process.env.ELEVENLABS_VOICE_ID ?? "").trim(),

  // Modelo por plano. Vazio = usa AI_MODEL. A foto usa AI_MODEL_VISION (análise visual pede o modelo mais forte).
  aiModelSemente: (process.env.AI_MODEL_SEMENTE ?? "").trim(),
  aiModelProdutor: (process.env.AI_MODEL_PRODUTOR ?? "").trim(),
  aiModelFazenda: (process.env.AI_MODEL_FAZENDA ?? "").trim(),
  aiModelVision: (process.env.AI_MODEL_VISION ?? "").trim(),

  // Assinaturas (Cakto). Desligado por padrão: sem BILLING_ENABLED=true ninguém é limitado.
  billingEnabled: readBool(process.env.BILLING_ENABLED, false),
  caktoWebhookToken: process.env.CAKTO_WEBHOOK_TOKEN ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",

  rateLimitPer10Min: readInt(process.env.RATE_LIMIT_MESSAGES_PER_10_MIN, 20, 1, 500),

  whatsappEnabled: readBool(process.env.WHATSAPP_ENABLED, false),
  whatsappVerifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? "",
};

/** Links de checkout da Cakto por plano e periodicidade. Só aceita https://. */
export type CheckoutLinks = Partial<Record<`${"produtor" | "fazenda"}_${"month" | "year"}`, string>>;

export function getCheckoutLinks(): CheckoutLinks {
  const entries: [keyof CheckoutLinks, string | undefined][] = [
    ["produtor_month", process.env.CAKTO_CHECKOUT_URL_PRODUTOR_MENSAL],
    ["produtor_year", process.env.CAKTO_CHECKOUT_URL_PRODUTOR_ANUAL],
    ["fazenda_month", process.env.CAKTO_CHECKOUT_URL_FAZENDA_MENSAL],
    ["fazenda_year", process.env.CAKTO_CHECKOUT_URL_FAZENDA_ANUAL],
  ];
  const links: CheckoutLinks = {};
  for (const [key, value] of entries) {
    const url = value?.trim();
    if (url?.startsWith("https://")) links[key] = url;
  }
  return links;
}

/** Link da área de gerenciamento/cancelamento da assinatura (opcional). */
export function getManageSubscriptionUrl(): string | null {
  const url = process.env.CAKTO_MANAGE_URL?.trim();
  return url?.startsWith("https://") ? url : null;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(serverEnv.supabaseUrl && serverEnv.supabaseAnonKey);
}

export function isAiConfigured(): boolean {
  return serverEnv.aiProvider === "anthropic" && Boolean(serverEnv.anthropicApiKey);
}

export function isServerSttConfigured(): boolean {
  return Boolean(serverEnv.elevenLabsApiKey);
}

export function isServerTtsConfigured(): boolean {
  return Boolean(serverEnv.elevenLabsApiKey && serverEnv.elevenLabsVoiceId);
}

/** Informações seguras para o navegador decidir quais recursos exibir. */
export type PublicCapabilities = {
  ai: boolean;
  serverTranscription: boolean;
  serverSpeech: boolean;
  officialSourcesSearch: boolean;
};

export function getPublicCapabilities(): PublicCapabilities {
  return {
    ai: isAiConfigured(),
    serverTranscription: isServerSttConfigured(),
    serverSpeech: isServerTtsConfigured(),
    officialSourcesSearch: isAiConfigured() && serverEnv.aiWebSearch,
  };
}
