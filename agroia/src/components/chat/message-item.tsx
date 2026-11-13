"use client";

import { useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Globe,
  Loader2,
  Mic,
  Square,
  Volume2,
} from "lucide-react";
import type { Source } from "@/lib/domain";
import { AssistantAvatar } from "@/components/brand/logo";
import { Markdown } from "./markdown";

export type UIAttachment = { path: string; url: string | null };

export type UIMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments: UIAttachment[];
  sources: Source[];
  status: "complete" | "refused" | "error" | "streaming";
  inputMode?: "text" | "voice";
  persisted: boolean;
  statusLabel?: string;
};

export function MessageItem({
  message,
  speaking,
  speechLoading,
  canSpeak,
  onSpeak,
  onStopSpeak,
}: {
  message: UIMessage;
  speaking: boolean;
  speechLoading: boolean;
  canSpeak: boolean;
  onSpeak: () => void;
  onStopSpeak: () => void;
}) {
  if (message.role === "user") {
    return (
      <div className="flex animate-fade-up justify-end">
        <div className="flex max-w-[86%] flex-col items-end gap-2 sm:max-w-[75%]">
          {message.attachments.length > 0 && (
            <div className={`grid gap-1.5 ${message.attachments.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
              {message.attachments.map((a) =>
                a.url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- URL assinada e temporária do Storage
                  <img
                    key={a.path}
                    src={a.url}
                    alt="Foto enviada"
                    className="size-36 rounded-3xl border border-line object-cover sm:size-44"
                  />
                ) : (
                  <div
                    key={a.path}
                    className="grid size-36 place-items-center rounded-3xl border border-line bg-surface-2 text-xs text-muted"
                  >
                    Foto
                  </div>
                ),
              )}
            </div>
          )}
          {message.content && (
            <div className="rounded-[28px] rounded-br-lg bg-brand px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap text-brand-fg sm:text-base">
              {message.content}
            </div>
          )}
          {message.inputMode === "voice" && (
            <span className="inline-flex items-center gap-1 text-xs text-subtle">
              <Mic className="size-3" aria-hidden /> Enviada por voz
            </span>
          )}
        </div>
      </div>
    );
  }

  const isStreaming = message.status === "streaming";
  const showDots = isStreaming && !message.content;

  return (
    <div className="flex animate-fade-up gap-3">
      <AssistantAvatar className="mt-0.5 size-8" />
      <div className="min-w-0 flex-1">
        {showDots ? (
          <div className="flex items-center gap-2 py-1.5 text-sm text-muted" role="status" aria-live="polite">
            <span className="flex gap-1" aria-hidden>
              <span className="typing-dot size-1.5 rounded-full bg-leaf" />
              <span className="typing-dot size-1.5 rounded-full bg-leaf" />
              <span className="typing-dot size-1.5 rounded-full bg-leaf" />
            </span>
            {message.statusLabel ?? "Analisando…"}
          </div>
        ) : (
          <>
            {message.status === "error" && !isStreaming && (
              <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-2.5 py-1 text-xs font-medium text-warning">
                <AlertTriangle className="size-3.5" aria-hidden /> Resposta incompleta
              </div>
            )}
            <Markdown>{message.content}</Markdown>
            {isStreaming && message.statusLabel && message.statusLabel !== "Escrevendo…" && (
              <p className="mt-2 flex items-center gap-2 text-xs text-muted" role="status">
                <Loader2 className="size-3.5 animate-spin" aria-hidden /> {message.statusLabel}
              </p>
            )}
          </>
        )}

        {!isStreaming && message.sources.length > 0 && <SourceList sources={message.sources} />}

        {!isStreaming && message.content && (
          <MessageActions
            text={message.content}
            speaking={speaking}
            speechLoading={speechLoading}
            canSpeak={canSpeak}
            onSpeak={onSpeak}
            onStopSpeak={onStopSpeak}
          />
        )}
      </div>
    </div>
  );
}

function SourceList({ sources }: { sources: Source[] }) {
  const [open, setOpen] = useState(false);
  const anyCited = sources.some((s) => s.cited);
  return (
    <div className="mt-3 rounded-3xl border border-line bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm font-medium"
        aria-expanded={open}
      >
        <BookOpen className="size-4 text-leaf" aria-hidden />
        <span className="flex-1">
          {anyCited ? "Referências" : "Fontes consultadas"} ({sources.length})
        </span>
        <ChevronDown className={`size-4 text-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
        <ul className="space-y-2 border-t border-line px-3.5 py-3 text-sm">
          {sources.map((s, i) => (
            <li key={`${s.url ?? s.title}-${i}`} className="flex gap-2">
              {s.kind === "knowledge_base" ? (
                <BookOpen className="mt-0.5 size-4 shrink-0 text-wheat" aria-hidden />
              ) : (
                <Globe className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
              )}
              <div className="min-w-0">
                {s.url ? (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="inline-flex items-start gap-1 font-medium text-fg underline-offset-2 hover:underline"
                  >
                    <span className="line-clamp-2">{s.title}</span>
                    <ExternalLink className="mt-1 size-3 shrink-0 text-subtle" aria-hidden />
                  </a>
                ) : (
                  <span className="font-medium">{s.title}</span>
                )}
                <p className="truncate text-xs text-subtle">
                  {s.kind === "knowledge_base" ? `Base técnica · ${s.institution ?? ""}` : hostname(s.url)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function hostname(url: string | null): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function MessageActions({
  text,
  speaking,
  speechLoading,
  canSpeak,
  onSpeak,
  onStopSpeak,
}: {
  text: string;
  speaking: boolean;
  speechLoading: boolean;
  canSpeak: boolean;
  onSpeak: () => void;
  onStopSpeak: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // área de transferência indisponível
    }
  };
  const actionClass =
    "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-muted transition hover:bg-surface-2 hover:text-fg active:scale-[0.97]";
  return (
    <div className="-ml-2 mt-1.5 flex flex-wrap items-center gap-0.5">
      {canSpeak &&
        (speaking ? (
          <button type="button" onClick={onStopSpeak} className={`${actionClass} text-brand`}>
            <Square className="size-3.5 fill-current" aria-hidden /> Parar áudio
          </button>
        ) : (
          <button type="button" onClick={onSpeak} className={actionClass} disabled={speechLoading}>
            {speechLoading ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Volume2 className="size-4" aria-hidden />
            )}
            Ouvir
          </button>
        ))}
      <button type="button" onClick={copy} className={actionClass}>
        {copied ? <Check className="size-4 text-leaf" aria-hidden /> : <Copy className="size-4" aria-hidden />}
        {copied ? "Copiado" : "Copiar"}
      </button>
    </div>
  );
}
