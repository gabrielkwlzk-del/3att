"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, MessageSquareText, Trash2 } from "lucide-react";
import { TOPIC_LABELS, type ConversationRow } from "@/lib/domain";
import { CONVERSATIONS_CHANGED } from "@/components/app-shell";

const dateFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export function ConversationList({ initial }: { initial: ConversationRow[] }) {
  const [items, setItems] = useState(initial);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const remove = async (c: ConversationRow) => {
    if (!window.confirm(`Excluir a conversa "${c.title}"? As fotos enviadas nela também serão apagadas.`)) return;
    setDeleting(c.id);
    setError(null);
    try {
      const res = await fetch(`/api/conversations/${c.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setItems((prev) => prev.filter((i) => i.id !== c.id));
      window.dispatchEvent(new Event(CONVERSATIONS_CHANGED));
    } catch {
      setError("Não foi possível excluir agora. Tente novamente.");
    } finally {
      setDeleting(null);
    }
  };

  if (!items.length) {
    return (
      <div className="mt-10 rounded-[28px] border border-dashed border-line p-8 text-center">
        <MessageSquareText className="mx-auto size-8 text-subtle" aria-hidden />
        <p className="mt-3 font-medium">Nenhuma conversa ainda</p>
        <p className="mt-1 text-sm text-muted">Faça sua primeira pergunta para a AgroIA.</p>
      </div>
    );
  }

  return (
    <>
      {error && (
        <p role="alert" className="mt-4 rounded-3xl bg-danger-soft px-4 py-2.5 text-sm text-danger">
          {error}
        </p>
      )}
      <ul className="mt-6 divide-y divide-line overflow-hidden rounded-[28px] border border-line bg-surface">
        {items.map((c) => (
          <li key={c.id} className="flex items-center">
            <Link href={`/chat/${c.id}`} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3.5 transition hover:bg-surface-2">
              <MessageSquareText className="size-5 shrink-0 text-subtle" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{c.title}</span>
                <span className="block text-xs text-subtle">
                  {TOPIC_LABELS[c.topic]} · {dateFormat.format(new Date(c.updated_at))}
                </span>
              </span>
            </Link>
            <button
              type="button"
              onClick={() => void remove(c)}
              disabled={deleting === c.id}
              className="mr-2 grid size-10 shrink-0 place-items-center rounded-full text-subtle transition hover:bg-danger-soft hover:text-danger"
              aria-label={`Excluir conversa ${c.title}`}
            >
              {deleting === c.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
