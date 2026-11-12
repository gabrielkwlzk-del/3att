import "server-only";
import { serverEnv } from "@/lib/env";

/**
 * Voz no servidor via ElevenLabs (opcional).
 * - Transcrição: POST /v1/speech-to-text (multipart: file, model_id, language_code)
 * - Fala: POST /v1/text-to-speech/{voice_id} → áudio MP3
 * A chave nunca vai para o navegador.
 */

const BASE_URL = "https://api.elevenlabs.io/v1";

export class VoiceServiceError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
    this.name = "VoiceServiceError";
  }
}

export async function transcribeAudio(audio: Blob, filename: string): Promise<string> {
  const form = new FormData();
  form.append("file", audio, filename);
  form.append("model_id", serverEnv.elevenLabsSttModel);
  form.append("language_code", "por");
  form.append("tag_audio_events", "false");

  const res = await fetch(`${BASE_URL}/speech-to-text`, {
    method: "POST",
    headers: { "xi-api-key": serverEnv.elevenLabsApiKey },
    body: form,
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    console.error("[voz] transcrição falhou:", res.status, await res.text().catch(() => ""));
    throw new VoiceServiceError("Não foi possível transcrever o áudio agora.", res.status === 429 ? 429 : 502);
  }
  const json = (await res.json()) as { text?: string };
  return (json.text ?? "").trim();
}

export async function synthesizeSpeech(text: string): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch(
    `${BASE_URL}/text-to-speech/${encodeURIComponent(serverEnv.elevenLabsVoiceId)}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": serverEnv.elevenLabsApiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({ text, model_id: serverEnv.elevenLabsTtsModel }),
      signal: AbortSignal.timeout(60_000),
    },
  );
  if (!res.ok || !res.body) {
    console.error("[voz] síntese falhou:", res.status, await res.text().catch(() => ""));
    throw new VoiceServiceError("Não foi possível gerar o áudio agora.", res.status === 429 ? 429 : 502);
  }
  return res.body;
}

/** Remove marcação Markdown para leitura em voz alta. */
export function markdownToSpeech(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\[\d+\]/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/[*_~>|]/g, "")
    .replace(/^\s*[-+]\s+/gm, "")
    .replace(/\n{2,}/g, ".\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}
