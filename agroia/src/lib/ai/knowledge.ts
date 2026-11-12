import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";

/**
 * Recuperação na base de conhecimento técnico (RAG).
 * - Sempre faz busca textual em português no Postgres (sem custo extra).
 * - Se VOYAGE_API_KEY estiver configurada, adiciona busca semântica por embeddings.
 * A base começa vazia: o conteúdo vem de publicações oficiais ingeridas com
 * `npm run kb:ingest` (veja knowledge/README.md). Nada é inventado aqui.
 */

export type KnowledgeChunk = {
  chunkId: number;
  content: string;
  documentId: string;
  title: string;
  institution: string;
  url: string | null;
  publishedYear: number | null;
  score: number;
};

export async function embedTexts(
  texts: string[],
  inputType: "query" | "document",
): Promise<number[][] | null> {
  if (!serverEnv.voyageApiKey || texts.length === 0) return null;
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serverEnv.voyageApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input: texts, model: serverEnv.voyageModel, input_type: inputType }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Falha ao gerar embeddings (${res.status}).`);
  const json = (await res.json()) as { data: { embedding: number[]; index: number }[] };
  return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

export async function searchKnowledge(
  supabase: SupabaseClient,
  query: string,
  limit = 5,
): Promise<KnowledgeChunk[]> {
  const text = query.trim().slice(0, 1000);
  if (text.length < 3) return [];

  let embedding: number[] | null = null;
  try {
    embedding = (await embedTexts([text], "query"))?.[0] ?? null;
  } catch (error) {
    // Sem embeddings seguimos só com busca textual; não é motivo para falhar o chat.
    console.warn("[knowledge] embeddings indisponíveis:", (error as Error).message);
  }

  const { data, error } = await supabase.rpc("search_knowledge", {
    query_text: text,
    query_embedding: embedding ? JSON.stringify(embedding) : null,
    match_count: limit,
  });

  if (error) {
    console.warn("[knowledge] busca falhou:", error.message);
    return [];
  }

  type Row = {
    chunk_id: number;
    content: string;
    document_id: string;
    title: string;
    institution: string;
    url: string | null;
    published_year: number | null;
    score: number;
  };

  return ((data ?? []) as Row[])
    .filter((r) => typeof r.content === "string" && r.content.trim().length > 0)
    .map((r) => ({
      chunkId: r.chunk_id,
      content: r.content,
      documentId: r.document_id,
      title: r.title,
      institution: r.institution,
      url: r.url,
      publishedYear: r.published_year,
      score: r.score,
    }));
}

/** Formata os trechos para o modelo, numerados para citação [n]. */
export function formatKnowledgeForPrompt(chunks: KnowledgeChunk[]): string {
  if (!chunks.length) return "";
  const body = chunks
    .map((c, i) => {
      const meta = [c.institution, c.publishedYear ? String(c.publishedYear) : null].filter(Boolean).join(", ");
      return `[${i + 1}] ${c.title} (${meta})\n${c.content.trim()}`;
    })
    .join("\n\n---\n\n");
  return `Trechos da base de conhecimento técnico (publicações oficiais). Use-os se forem relevantes e cite pelo número entre colchetes; ignore os que não tiverem relação com a pergunta:\n\n${body}`;
}
