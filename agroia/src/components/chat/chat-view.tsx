"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDown, Camera, CloudSun, Info, Sprout } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { readEventStream } from "@/lib/client/sse";
import { SUGGESTIONS, TOPIC_LABELS, type Source, type Topic } from "@/lib/domain";
import type { PublicCapabilities } from "@/lib/env";
import { AssistantAvatar } from "@/components/brand/logo";
import { CONVERSATIONS_CHANGED } from "@/components/app-shell";
import { Composer, type PendingImage } from "./composer";
import { MessageItem, type UIMessage } from "./message-item";
import { useSpeaker } from "./use-voice";

type Props = {
  userId: string;
  conversationId: string | null;
  topic: Topic;
  initialMessages: UIMessage[];
  capabilities: PublicCapabilities;
  initialPrompt?: string;
  hasProperty: boolean;
};

export function ChatView({
  userId,
  conversationId: initialConversationId,
  topic,
  initialMessages,
  capabilities,
  initialPrompt,
  hasProperty,
}: Props) {
  const [messages, setMessages] = useState<UIMessage[]>(initialMessages);
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [upgradeUrl, setUpgradeUrl] = useState<string | null>(null);
  const [showJump, setShowJump] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const autoSentRef = useRef(false);
  const speaker = useSpeaker(capabilities.serverSpeech);

  const scrollToBottom = useCallback((smooth = true) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  // Rola para o fim só quando há mensagens (o estado vazio começa no topo)
  useEffect(() => {
    if (messages.length && stickRef.current) scrollToBottom(false);
  }, [messages, scrollToBottom]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    stickRef.current = nearBottom;
    setShowJump(!nearBottom);
  };

  const updateMessage = (id: string, patch: Partial<UIMessage> | ((m: UIMessage) => Partial<UIMessage>)) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...(typeof patch === "function" ? patch(m) : patch) } : m)),
    );
  };

  const uploadImages = async (images: PendingImage[]) => {
    const supabase = createClient();
    return Promise.all(
      images.map(async (img) => {
        const path = `${userId}/${crypto.randomUUID()}.jpg`;
        const { error } = await supabase.storage
          .from("plant-photos")
          .upload(path, img.blob, { contentType: "image/jpeg", upsert: false });
        if (error) throw new Error("Não foi possível enviar a foto. Verifique sua conexão.");
        return { path, previewUrl: img.previewUrl };
      }),
    );
  };

  const send = useCallback(
    async (text: string, images: PendingImage[], inputMode: "text" | "voice"): Promise<boolean> => {
      if (!capabilities.ai) {
        setBanner("O assistente de IA ainda não foi configurado neste servidor.");
        return false;
      }
      setBanner(null);
      setUpgradeUrl(null);
      setBusy(true);
      stickRef.current = true;

      const userTempId = `tmp-user-${Date.now()}`;
      const assistantTempId = `tmp-assistant-${Date.now()}`;

      let uploaded: { path: string; previewUrl: string }[] = [];
      try {
        if (images.length) uploaded = await uploadImages(images);
      } catch (e) {
        setBanner((e as Error).message);
        setBusy(false);
        return false;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: userTempId,
          role: "user",
          content: text,
          attachments: uploaded.map((u) => ({ path: u.path, url: u.previewUrl })),
          sources: [],
          status: "complete",
          inputMode,
          persisted: false,
        },
        {
          id: assistantTempId,
          role: "assistant",
          content: "",
          attachments: [],
          sources: [],
          status: "streaming",
          persisted: false,
          statusLabel: uploaded.length ? "Analisando a foto…" : "Analisando…",
        },
      ]);

      const controller = new AbortController();
      abortRef.current = controller;
      let assistantId = assistantTempId;
      let finalText = "";
      let finalStatus: UIMessage["status"] = "complete";
      let sawDone = false;

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: conversationId ?? undefined,
            topic,
            message: text,
            inputMode,
            attachments: uploaded.map((u) => ({ path: u.path, mediaType: "image/jpeg" })),
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string; upgradeUrl?: string };
          setMessages((prev) => prev.filter((m) => m.id !== userTempId && m.id !== assistantTempId));
          setBanner(data.error ?? "Não foi possível enviar sua mensagem.");
          setUpgradeUrl(res.status === 402 && data.upgradeUrl ? data.upgradeUrl : null);
          return false;
        }

        await readEventStream(res, (event, data) => {
          const payload = data as Record<string, unknown>;
          if (event === "meta") {
            const id = payload.conversationId as string;
            if (!conversationId && id) {
              setConversationId(id);
              window.history.replaceState(null, "", `/chat/${id}`);
              window.dispatchEvent(new Event(CONVERSATIONS_CHANGED));
            }
            updateMessage(userTempId, { id: payload.userMessageId as string, persisted: true });
          } else if (event === "status") {
            updateMessage(assistantId, { statusLabel: payload.label as string });
          } else if (event === "delta") {
            finalText += payload.text as string;
            updateMessage(assistantId, (m) => ({ content: m.content + (payload.text as string) }));
          } else if (event === "reset") {
            finalText = "";
            updateMessage(assistantId, { content: "" });
          } else if (event === "done") {
            sawDone = true;
            finalStatus = (payload.status as UIMessage["status"]) ?? "complete";
            const newId = (payload.messageId as string | null) ?? assistantId;
            updateMessage(assistantId, {
              id: newId,
              status: finalStatus,
              sources: (payload.sources as Source[]) ?? [],
              persisted: Boolean(payload.messageId),
              statusLabel: undefined,
            });
            assistantId = newId;
            window.dispatchEvent(new Event(CONVERSATIONS_CHANGED));
          } else if (event === "error") {
            sawDone = true;
            finalStatus = "error";
            updateMessage(assistantId, (m) => ({
              status: "error",
              statusLabel: undefined,
              content: m.content || (payload.message as string),
            }));
          }
        });

        if (!sawDone) {
          updateMessage(assistantId, (m) => ({
            status: "error",
            statusLabel: undefined,
            content: m.content || "A conexão foi interrompida antes da resposta terminar. Tente novamente.",
          }));
        } else if (inputMode === "voice" && finalStatus === "complete" && finalText) {
          // Pergunta feita por voz: responde em áudio automaticamente (quando o navegador permitir)
          void speaker.speak(assistantId, finalText, true);
        }
        return true;
      } catch (e) {
        if ((e as Error).name === "AbortError") {
          updateMessage(assistantId, (m) => ({
            status: "error",
            statusLabel: undefined,
            content: m.content ? `${m.content}\n\n_(resposta interrompida)_` : "_Resposta interrompida._",
          }));
          return true;
        }
        updateMessage(assistantId, (m) => ({
          status: "error",
          statusLabel: undefined,
          content: m.content || "Sem conexão com a AgroIA. Verifique sua internet e tente novamente.",
        }));
        return true;
      } finally {
        abortRef.current = null;
        setBusy(false);
      }
    },
    // uploadImages é estável na prática (depende só de userId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [capabilities.ai, conversationId, topic, userId, speaker.speak],
  );

  // Pergunta vinda da tela inicial ou de uma sugestão: envia automaticamente uma vez
  useEffect(() => {
    if (initialPrompt && !autoSentRef.current && messages.length === 0) {
      autoSentRef.current = true;
      void send(initialPrompt, [], "text");
    }
  }, [initialPrompt, messages.length, send]);

  const stop = () => abortRef.current?.abort();
  const empty = messages.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scrollRef} onScroll={onScroll} className="relative min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto w-full max-w-3xl px-4 pt-6 pb-6 sm:px-6">
          {empty ? (
            <EmptyState
              topic={topic}
              hasProperty={hasProperty}
              onPick={(q) => void send(q, [], "text")}
              disabled={busy || !capabilities.ai}
            />
          ) : (
            <div className="space-y-6">
              {messages.map((m) => (
                <MessageItem
                  key={m.id}
                  message={m}
                  canSpeak={speaker.available}
                  speaking={speaker.speakingId === m.id}
                  speechLoading={speaker.loadingId === m.id}
                  onSpeak={() => void speaker.speak(m.id, m.content, m.persisted).then((err) => err && setBanner(err))}
                  onStopSpeak={speaker.stop}
                />
              ))}
            </div>
          )}
        </div>
        {showJump && (
          <button
            type="button"
            onClick={() => {
              stickRef.current = true;
              scrollToBottom();
            }}
            className="sticky bottom-3 left-1/2 mx-auto grid size-10 -translate-x-1/2 place-items-center rounded-full border border-line bg-surface shadow-card"
            aria-label="Ir para o fim da conversa"
          >
            <ArrowDown className="size-4" />
          </button>
        )}
      </div>

      <div className="border-t border-line/70 bg-bg/90 px-3 pt-3 pb-3 backdrop-blur sm:px-6 pb-safe">
        {banner && (
          <div role="alert" className="mx-auto mb-2 flex max-w-3xl items-start gap-2 rounded-3xl bg-warning-soft px-3.5 py-2.5 text-sm text-warning">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span className="flex-1">{banner}</span>
            {upgradeUrl && (
              <Link href={upgradeUrl} className="shrink-0 font-semibold underline">
                Ver planos
              </Link>
            )}
          </div>
        )}
        <Composer
          busy={busy}
          onSend={send}
          onStop={stop}
          serverTranscription={capabilities.serverTranscription}
          placeholder={topic === "diagnostico" ? "Descreva o problema…" : "Escreva sua pergunta…"}
          autoFocus={empty}
        />
        <p className="mx-auto mt-2 max-w-3xl text-center text-[11px] leading-snug text-subtle">
          A AgroIA pode errar. Confirme decisões importantes com um engenheiro agrônomo ou médico-veterinário.
        </p>
      </div>
    </div>
  );
}

function EmptyState({
  topic,
  hasProperty,
  onPick,
  disabled,
}: {
  topic: Topic;
  hasProperty: boolean;
  onPick: (q: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="animate-fade-up pt-4 sm:pt-10">
      <div className="flex items-center gap-3">
        <AssistantAvatar className="size-11" />
        <div>
          <p className="text-xs font-medium tracking-wide text-leaf uppercase">{TOPIC_LABELS[topic]}</p>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            {topic === "diagnostico" ? "Vamos entender o que está acontecendo" : "Como posso ajudar?"}
          </h1>
        </div>
      </div>

      {topic === "diagnostico" && (
        <div className="mt-5 rounded-[28px] border border-line bg-surface p-4 sm:p-5">
          <p className="flex items-center gap-2 font-medium">
            <Camera className="size-5 text-leaf" aria-hidden /> Dicas para uma boa análise por foto
          </p>
          <ul className="mt-2.5 space-y-1.5 text-sm text-muted">
            <li>• Uma foto da planta inteira e outra da folha de perto (frente e verso).</li>
            <li>• Luz natural, sem sombra forte, com o sintoma em foco.</li>
            <li>• Conte a cultura, a idade da lavoura e há quanto tempo apareceu.</li>
          </ul>
          <p className="mt-3 text-xs text-subtle">
            A análise por foto indica hipóteses, não um laudo. Casos sérios precisam de avaliação de um agrônomo.
          </p>
        </div>
      )}

      {topic === "clima" && (
        <Link
          href="/clima"
          className="mt-5 flex items-center gap-3 rounded-[28px] border border-line bg-surface p-4 transition hover:border-brand/40"
        >
          <CloudSun className="size-6 text-wheat" aria-hidden />
          <span className="text-sm">
            <span className="font-medium">Ver painel do clima</span>
            <span className="block text-muted">Previsão, alertas de geada e janelas de pulverização.</span>
          </span>
        </Link>
      )}

      {!hasProperty && (
        <Link
          href="/propriedade"
          className="mt-3 flex items-center gap-3 rounded-[28px] bg-wheat-soft p-4 text-sm transition hover:brightness-[0.98]"
        >
          <Sprout className="size-5 shrink-0 text-wheat" aria-hidden />
          <span>
            <span className="font-medium">Cadastre sua propriedade</span> para receber respostas adaptadas à sua
            região e às suas culturas.
          </span>
        </Link>
      )}

      <p className="mt-7 mb-2.5 text-sm font-medium text-muted">Sugestões</p>
      <div className="flex flex-col gap-2">
        {SUGGESTIONS[topic].map((q) => (
          <button
            key={q}
            type="button"
            disabled={disabled}
            onClick={() => onPick(q)}
            className="rounded-3xl border border-line bg-surface px-4 py-3 text-left text-[15px] transition hover:border-brand/40 hover:bg-brand-soft/50 active:scale-[0.99] disabled:opacity-50"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
