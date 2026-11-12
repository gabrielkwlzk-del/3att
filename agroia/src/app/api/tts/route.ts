import { z } from "zod";
import { getAuthContext } from "@/lib/supabase/server";
import { isServerTtsConfigured } from "@/lib/env";
import { memoryRateLimit } from "@/lib/rate-limit";
import { markdownToSpeech, synthesizeSpeech, VoiceServiceError } from "@/lib/voice/elevenlabs";

export const maxDuration = 60;

const BodySchema = z.object({ messageId: z.string().uuid() });
const MAX_CHARS = 2500;

/** Gera o áudio de uma resposta da AgroIA. Só lê mensagens do próprio usuário (RLS). */
export async function POST(request: Request) {
  const { supabase, user } = await getAuthContext();
  if (!user) return Response.json({ error: "Faça login para continuar." }, { status: 401 });
  if (!isServerTtsConfigured()) {
    return Response.json({ error: "Áudio no servidor não configurado." }, { status: 501 });
  }
  if (!memoryRateLimit(`tts:${user.id}`, 30, 10 * 60 * 1000)) {
    return Response.json({ error: "Muitos pedidos de áudio. Aguarde alguns minutos." }, { status: 429 });
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Pedido inválido." }, { status: 400 });

  const { data: message } = await supabase
    .from("messages")
    .select("content, role")
    .eq("id", parsed.data.messageId)
    .maybeSingle();
  if (!message || message.role !== "assistant") {
    return Response.json({ error: "Mensagem não encontrada." }, { status: 404 });
  }

  let text = markdownToSpeech(message.content as string);
  if (text.length > MAX_CHARS) {
    const cut = text.slice(0, MAX_CHARS);
    text = `${cut.slice(0, Math.max(cut.lastIndexOf("."), MAX_CHARS - 200) + 1)} O restante da resposta está no texto.`;
  }

  try {
    const audio = await synthesizeSpeech(text);
    return new Response(audio, {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=3600" },
    });
  } catch (error) {
    const status = error instanceof VoiceServiceError ? error.status : 500;
    return Response.json({ error: "Não foi possível gerar o áudio agora." }, { status });
  }
}
