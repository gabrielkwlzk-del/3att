import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthContext } from "@/lib/supabase/server";
import { isAiConfigured } from "@/lib/env";
import { checkMessageRateLimit } from "@/lib/rate-limit";
import { runAssistant, describeAiError, type AssistantEvent } from "@/lib/ai/assistant";
import { searchKnowledge, formatKnowledgeForPrompt } from "@/lib/ai/knowledge";
import { TOPICS, type Attachment, type MessageRow, type PropertyRow, type Topic } from "@/lib/domain";

export const maxDuration = 300;

type ContentBlock = Anthropic.Beta.BetaContentBlockParam;
type MessageParam = Anthropic.Beta.BetaMessageParam;

const BodySchema = z
  .object({
    conversationId: z.string().uuid().optional(),
    topic: z.enum(TOPICS).optional(),
    message: z.string().trim().max(4000),
    inputMode: z.enum(["text", "voice"]).default("text"),
    attachments: z
      .array(
        z.object({
          path: z.string().min(3).max(300),
          mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]),
        }),
      )
      .max(4)
      .default([]),
  })
  .refine((b) => b.message.length > 0 || b.attachments.length > 0, {
    message: "Envie uma mensagem ou uma foto.",
  });

const HISTORY_LIMIT = 40;
const IMAGE_TURNS_TO_RESEND = 2;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function jsonError(message: string, status: number, headers?: HeadersInit) {
  return Response.json({ error: message }, { status, headers });
}

export async function POST(request: Request) {
  const { supabase, user } = await getAuthContext();
  if (!user) return jsonError("Faça login para continuar.", 401);
  if (!isAiConfigured()) {
    return jsonError("O assistente de IA ainda não foi configurado neste servidor (ANTHROPIC_API_KEY).", 503);
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch {
    return jsonError("Mensagem inválida.", 400);
  }

  // Fotos só podem vir da pasta do próprio usuário (o RLS do Storage também garante isso).
  const attachments: Attachment[] = body.attachments.filter(
    (a) => a.path.startsWith(`${user.id}/`) && !a.path.includes(".."),
  );
  if (attachments.length !== body.attachments.length) return jsonError("Anexo inválido.", 400);

  const limit = await checkMessageRateLimit(supabase, user.id);
  if (!limit.allowed) {
    return jsonError(
      "Você enviou muitas mensagens em pouco tempo. Aguarde alguns minutos e tente novamente.",
      429,
      { "Retry-After": String(limit.retryAfterSeconds) },
    );
  }

  // Conversa: cria uma nova ou confirma que pertence ao usuário.
  let conversationId = body.conversationId;
  let topic: Topic = body.topic ?? "geral";
  if (conversationId) {
    const { data, error } = await supabase
      .from("conversations")
      .select("id, topic")
      .eq("id", conversationId)
      .maybeSingle();
    if (error || !data) return jsonError("Conversa não encontrada.", 404);
    topic = data.topic as Topic;
  } else {
    const title = body.message
      ? body.message.replace(/\s+/g, " ").slice(0, 80)
      : attachments.length > 1
        ? "Análise de fotos"
        : "Análise de foto";
    const { data, error } = await supabase
      .from("conversations")
      .insert({ user_id: user.id, title, topic })
      .select("id")
      .single();
    if (error || !data) return jsonError("Não foi possível iniciar a conversa.", 500);
    conversationId = data.id as string;
  }

  const { data: userMessage, error: insertError } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      user_id: user.id,
      role: "user",
      content: body.message,
      attachments,
      input_mode: body.inputMode,
    })
    .select("id")
    .single();
  if (insertError || !userMessage) return jsonError("Não foi possível salvar sua mensagem.", 500);

  const [{ data: historyDesc }, { data: property }, knowledge] = await Promise.all([
    supabase
      .from("messages")
      .select("id, role, content, attachments, status, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT),
    supabase.from("properties").select("*").eq("user_id", user.id).maybeSingle(),
    body.message ? searchKnowledge(supabase, body.message) : Promise.resolve([]),
  ]);

  const history = ((historyDesc ?? []) as Pick<MessageRow, "id" | "role" | "content" | "attachments" | "status">[]).reverse();
  const messages = await buildModelMessages(supabase, history, userMessage.id as string, formatKnowledgeForPrompt(knowledge));

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      send("meta", { conversationId, userMessageId: userMessage.id });

      let partial = "";
      const onEvent = (event: AssistantEvent) => {
        if (event.type === "delta") partial += event.text;
        if (event.type === "reset") partial = "";
        send(event.type, event);
      };

      try {
        const result = await runAssistant({
          messages,
          topic,
          property: (property as PropertyRow | null) ?? null,
          knowledge,
          signal: request.signal,
          onEvent,
        });

        const { data: saved } = await supabase
          .from("messages")
          .insert({
            conversation_id: conversationId,
            user_id: user.id,
            role: "assistant",
            content: result.text,
            sources: result.sources,
            status: result.status,
            model: result.model,
            input_tokens: result.inputTokens,
            output_tokens: result.outputTokens,
          })
          .select("id")
          .single();
        await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);

        send("done", { messageId: saved?.id ?? null, status: result.status, sources: result.sources });
      } catch (error) {
        if (request.signal.aborted) {
          // O produtor interrompeu: guardamos o que já foi gerado para manter o histórico coerente.
          if (partial.trim()) {
            await supabase.from("messages").insert({
              conversation_id: conversationId,
              user_id: user.id,
              role: "assistant",
              content: `${partial.trim()}\n\n_(resposta interrompida)_`,
              status: "error",
            });
          }
        } else {
          console.error("[chat] falha ao gerar resposta:", error);
          const { message } = describeAiError(error);
          send("error", { message });
        }
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          // já encerrado
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

/**
 * Monta o histórico no formato do modelo. Reenvia as imagens apenas das
 * mensagens mais recentes com fotos (custo e latência); nas antigas, deixa
 * uma nota textual para manter o contexto.
 */
async function buildModelMessages(
  supabase: SupabaseClient,
  history: Pick<MessageRow, "id" | "role" | "content" | "attachments" | "status">[],
  latestUserMessageId: string,
  knowledgeText: string,
): Promise<MessageParam[]> {
  const withImages = history
    .filter((m) => m.role === "user" && m.attachments?.length)
    .slice(-IMAGE_TURNS_TO_RESEND)
    .map((m) => m.id);

  const today = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "full",
  }).format(new Date());

  // A conversa enviada ao modelo precisa começar com uma mensagem do usuário.
  const firstUser = history.findIndex((m) => m.role === "user");
  const relevant = firstUser >= 0 ? history.slice(firstUser) : history;

  const result: MessageParam[] = [];
  for (const message of relevant) {
    if (message.role === "assistant") {
      if (message.content.trim()) result.push({ role: "assistant", content: message.content });
      continue;
    }

    const blocks: ContentBlock[] = [];
    const attachments = (message.attachments ?? []) as Attachment[];
    if (attachments.length && withImages.includes(message.id)) {
      const images = await Promise.all(attachments.map((a) => loadImage(supabase, a)));
      for (const image of images) if (image) blocks.push(image);
      const missing = images.filter((i) => !i).length;
      if (missing) blocks.push({ type: "text", text: `[${missing} foto(s) não puderam ser carregadas]` });
    } else if (attachments.length) {
      blocks.push({
        type: "text",
        text: `[Nesta mensagem o produtor enviou ${attachments.length} foto(s), analisada(s) anteriormente.]`,
      });
    }

    if (message.id === latestUserMessageId) {
      blocks.push({ type: "text", text: `[Data de hoje: ${today}]` });
      if (knowledgeText) blocks.push({ type: "text", text: knowledgeText });
    }

    const text = message.content.trim() || (attachments.length ? "Analise a(s) foto(s), por favor." : "");
    if (text) blocks.push({ type: "text", text });
    if (blocks.length) result.push({ role: "user", content: blocks });
  }
  return result;
}

async function loadImage(supabase: SupabaseClient, attachment: Attachment): Promise<ContentBlock | null> {
  const { data, error } = await supabase.storage.from("plant-photos").download(attachment.path);
  if (error || !data || data.size > MAX_IMAGE_BYTES) return null;
  const base64 = Buffer.from(await data.arrayBuffer()).toString("base64");
  return {
    type: "image",
    source: { type: "base64", media_type: attachment.mediaType, data: base64 },
  };
}
