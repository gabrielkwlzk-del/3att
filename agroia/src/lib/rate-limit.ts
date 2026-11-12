import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";

/**
 * Limite simples por usuário baseado nas próprias mensagens salvas
 * (funciona em ambiente serverless sem Redis). Protege custos de IA.
 */
export async function checkMessageRateLimit(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const windowStart = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("role", "user")
    .gte("created_at", windowStart);

  if (error) {
    // Em caso de falha na contagem, não bloqueamos o produtor, mas registramos.
    console.warn("[rate-limit] contagem falhou:", error.message);
    return { allowed: true, retryAfterSeconds: 0 };
  }
  const allowed = (count ?? 0) < serverEnv.rateLimitPer10Min;
  return { allowed, retryAfterSeconds: allowed ? 0 : 120 };
}

/** Limite leve em memória para rotas auxiliares (voz). Por instância do servidor. */
const buckets = new Map<string, { count: number; resetAt: number }>();
export function memoryRateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 5000) {
      for (const [k, b] of buckets) if (b.resetAt < now) buckets.delete(k);
    }
    return true;
  }
  bucket.count += 1;
  return bucket.count <= max;
}
