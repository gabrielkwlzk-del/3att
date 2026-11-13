import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { serverEnv } from "@/lib/env";

let client: Anthropic | null = null;

/** Cliente único do provedor de IA (a chave fica só no servidor). */
export function getAnthropic(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: serverEnv.anthropicApiKey, maxRetries: 2, timeout: 180_000 });
  return client;
}
