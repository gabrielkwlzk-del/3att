"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Camera, Check, Loader2, Mic, Square, X } from "lucide-react";
import { prepareImage } from "@/lib/client/image";
import { useDictation, useRecorder } from "./use-voice";

export type PendingImage = { id: string; blob: Blob; previewUrl: string };

const MAX_IMAGES = 4;

export function Composer({
  busy,
  onSend,
  onStop,
  serverTranscription,
  placeholder,
  initialText,
  autoFocus,
}: {
  busy: boolean;
  onSend: (text: string, images: PendingImage[], inputMode: "text" | "voice") => Promise<boolean>;
  onStop: () => void;
  serverTranscription: boolean;
  placeholder: string;
  initialText?: string;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState(initialText ?? "");
  const [images, setImages] = useState<PendingImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [interim, setInterim] = useState("");
  const [usedVoice, setUsedVoice] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recorder = useRecorder();
  const dictation = useDictation();
  const baseTextRef = useRef("");

  const voiceMode: "server" | "browser" | null =
    serverTranscription && recorder.supported ? "server" : dictation.supported ? "browser" : null;

  // Ajusta a altura do campo conforme o texto
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [text, interim]);

  useEffect(() => {
    if (autoFocus && window.matchMedia("(pointer: fine)").matches) textareaRef.current?.focus();
  }, [autoFocus]);

  // Libera as prévias locais ao desmontar
  const imagesRef = useRef(images);
  useEffect(() => {
    imagesRef.current = images;
  }, [images]);
  useEffect(() => () => imagesRef.current.forEach((i) => URL.revokeObjectURL(i.previewUrl)), []);

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    const room = MAX_IMAGES - images.length;
    if (room <= 0) {
      setError(`Envie no máximo ${MAX_IMAGES} fotos por mensagem.`);
      return;
    }
    const selected = Array.from(files).slice(0, room);
    for (const file of selected) {
      try {
        const prepared = await prepareImage(file);
        setImages((prev) => [...prev, { id: crypto.randomUUID(), blob: prepared.blob, previewUrl: prepared.previewUrl }]);
      } catch (e) {
        setError((e as Error).message);
      }
    }
    if (files.length > room) setError(`Apenas ${MAX_IMAGES} fotos por mensagem.`);
  };

  const removeImage = (id: string) => {
    setImages((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  };

  const submit = async () => {
    const message = text.trim();
    if (busy || (!message && images.length === 0)) return;
    if (dictation.listening) dictation.stop();
    setError(null);
    const sending = images;
    const mode = usedVoice ? "voice" : "text";
    setText("");
    setImages([]);
    setUsedVoice(false);
    const ok = await onSend(message, sending, mode);
    if (!ok) {
      // Devolve o conteúdo para o produtor tentar de novo
      setText(message);
      setImages(sending);
      setUsedVoice(mode === "voice");
    } else {
      sending.forEach((i) => URL.revokeObjectURL(i.previewUrl));
    }
  };

  const startVoice = async () => {
    setError(null);
    if (voiceMode === "server") {
      try {
        await recorder.start();
      } catch {
        setError("Não foi possível acessar o microfone. Verifique a permissão do navegador.");
      }
    } else if (voiceMode === "browser") {
      baseTextRef.current = text ? `${text.trim()} ` : "";
      dictation.start(
        (finalText, interimText) => {
          setText(baseTextRef.current + finalText);
          setInterim(interimText);
          setUsedVoice(true);
        },
        (message) => setError(message),
      );
    }
  };

  const finishRecording = async () => {
    const blob = await recorder.stop();
    if (!blob || blob.size < 1200) {
      setError("Áudio muito curto. Segure o celular perto da boca e fale novamente.");
      return;
    }
    setTranscribing(true);
    try {
      const form = new FormData();
      form.append("audio", blob, "mensagem");
      const res = await fetch("/api/transcribe", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
      if (!res.ok || !data.text) throw new Error(data.error ?? "Não foi possível transcrever o áudio.");
      setText((prev) => (prev ? `${prev.trim()} ${data.text}` : data.text!));
      setUsedVoice(true);
      textareaRef.current?.focus();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTranscribing(false);
    }
  };

  const canSend = (text.trim().length > 0 || images.length > 0) && !transcribing;
  const iconButton =
    "grid size-11 shrink-0 place-items-center rounded-full transition active:scale-95 disabled:opacity-40";

  return (
    <div className="mx-auto w-full max-w-3xl">
      {error && (
        <div
          role="alert"
          className="mb-2 flex items-start gap-2 rounded-2xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger animate-pop"
        >
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Fechar aviso" className="-m-1 p-1">
            <X className="size-4" />
          </button>
        </div>
      )}

      <div className="rounded-[26px] border border-line bg-surface p-1.5 shadow-card focus-within:border-brand/50">
        {images.length > 0 && (
          <div className="flex gap-2 overflow-x-auto px-1.5 pt-1.5 pb-2 scrollbar-thin">
            {images.map((img) => (
              <div key={img.id} className="relative shrink-0 animate-pop">
                {/* eslint-disable-next-line @next/next/no-img-element -- prévia local (blob:) */}
                <img src={img.previewUrl} alt="Foto selecionada" className="size-16 rounded-xl object-cover" />
                <button
                  type="button"
                  onClick={() => removeImage(img.id)}
                  className="absolute -top-1.5 -right-1.5 grid size-6 place-items-center rounded-full bg-fg text-bg shadow"
                  aria-label="Remover foto"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {recorder.recording ? (
          <div className="flex items-center gap-2 px-1 py-0.5">
            <button
              type="button"
              onClick={recorder.cancel}
              className={`${iconButton} text-muted hover:bg-surface-2`}
              aria-label="Cancelar gravação"
            >
              <X className="size-5" />
            </button>
            <div className="flex flex-1 items-center gap-3 rounded-full bg-danger-soft px-4 py-2.5" role="status">
              <span className="recording-pulse size-2.5 rounded-full bg-danger" aria-hidden />
              <span className="font-mono text-sm tabular-nums text-danger">
                {Math.floor(recorder.seconds / 60)}:{String(recorder.seconds % 60).padStart(2, "0")}
              </span>
              <span className="flex h-5 flex-1 items-center gap-[3px]" aria-hidden>
                {Array.from({ length: 18 }).map((_, i) => (
                  <span
                    key={i}
                    className="w-[3px] rounded-full bg-danger/70 transition-[height] duration-100"
                    style={{ height: `${Math.max(12, Math.min(100, recorder.level * 100 * (0.5 + ((i * 7) % 5) / 5)))}%` }}
                  />
                ))}
              </span>
              <span className="sr-only">Gravando mensagem de voz</span>
            </div>
            <button
              type="button"
              onClick={finishRecording}
              className={`${iconButton} bg-brand text-brand-fg`}
              aria-label="Concluir gravação e transcrever"
            >
              <Check className="size-5" />
            </button>
          </div>
        ) : (
          <div className="flex items-end gap-1">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                void addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className={`${iconButton} text-muted hover:bg-surface-2 hover:text-fg`}
              aria-label="Enviar foto da planta (câmera ou galeria)"
              disabled={busy || images.length >= MAX_IMAGES}
            >
              <Camera className="size-[22px]" />
            </button>

            <label className="sr-only" htmlFor="composer-input">
              Mensagem
            </label>
            <textarea
              id="composer-input"
              ref={textareaRef}
              value={interim ? `${text}${text && !text.endsWith(" ") ? " " : ""}${interim}` : text}
              onChange={(e) => {
                setText(e.target.value);
                setInterim("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia("(pointer: fine)").matches) {
                  e.preventDefault();
                  void submit();
                }
              }}
              rows={1}
              maxLength={4000}
              placeholder={transcribing ? "Transcrevendo seu áudio…" : dictation.listening ? "Pode falar…" : placeholder}
              className="max-h-[180px] min-h-11 flex-1 resize-none bg-transparent px-1 py-[11px] text-base leading-6 outline-none placeholder:text-subtle"
              disabled={transcribing}
            />

            {busy ? (
              <button
                type="button"
                onClick={onStop}
                className={`${iconButton} bg-fg text-bg`}
                aria-label="Parar resposta"
              >
                <Square className="size-4 fill-current" />
              </button>
            ) : transcribing ? (
              <span className={`${iconButton} text-brand`} role="status" aria-label="Transcrevendo">
                <Loader2 className="size-5 animate-spin" />
              </span>
            ) : canSend && !dictation.listening ? (
              <button
                type="button"
                onClick={() => void submit()}
                className={`${iconButton} bg-brand text-brand-fg hover:bg-brand-strong`}
                aria-label="Enviar mensagem"
              >
                <ArrowUp className="size-5" />
              </button>
            ) : voiceMode ? (
              <button
                type="button"
                onClick={dictation.listening ? dictation.stop : startVoice}
                className={`${iconButton} ${dictation.listening ? "recording-pulse bg-danger text-white" : "bg-brand-soft text-brand hover:bg-brand hover:text-brand-fg"}`}
                aria-label={dictation.listening ? "Parar ditado" : "Gravar mensagem de voz"}
              >
                {dictation.listening ? <Square className="size-4 fill-current" /> : <Mic className="size-5" />}
              </button>
            ) : (
              <button type="button" disabled className={`${iconButton} bg-brand text-brand-fg`} aria-label="Enviar mensagem">
                <ArrowUp className="size-5" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
