import { getAuthContext } from "@/lib/supabase/server";
import { isServerSttConfigured } from "@/lib/env";
import { memoryRateLimit } from "@/lib/rate-limit";
import { transcribeAudio, VoiceServiceError } from "@/lib/voice/elevenlabs";

export const maxDuration = 60;

const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // ~10 min de áudio comprimido
const ALLOWED_TYPES = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-m4a", "audio/aac"];

export async function POST(request: Request) {
  const { user } = await getAuthContext();
  if (!user) return Response.json({ error: "Faça login para continuar." }, { status: 401 });
  if (!isServerSttConfigured()) {
    return Response.json({ error: "Transcrição no servidor não configurada." }, { status: 501 });
  }
  if (!memoryRateLimit(`stt:${user.id}`, 20, 10 * 60 * 1000)) {
    return Response.json({ error: "Muitos áudios em pouco tempo. Aguarde alguns minutos." }, { status: 429 });
  }

  const form = await request.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) {
    return Response.json({ error: "Áudio não recebido." }, { status: 400 });
  }
  const baseType = audio.type.split(";")[0];
  if (!ALLOWED_TYPES.includes(baseType)) {
    return Response.json({ error: "Formato de áudio não suportado." }, { status: 415 });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return Response.json({ error: "Áudio muito longo. Grave mensagens de até alguns minutos." }, { status: 413 });
  }

  try {
    const extension = baseType.split("/")[1]?.replace("x-", "") ?? "webm";
    const text = await transcribeAudio(audio, `mensagem.${extension}`);
    if (!text) return Response.json({ error: "Não entendi o áudio. Tente falar mais perto do microfone." }, { status: 422 });
    return Response.json({ text });
  } catch (error) {
    const status = error instanceof VoiceServiceError ? error.status : 500;
    const message = error instanceof VoiceServiceError ? error.message : "Erro ao transcrever o áudio.";
    return Response.json({ error: message }, { status });
  }
}
