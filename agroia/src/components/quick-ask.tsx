"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp } from "lucide-react";

/** Campo da tela inicial: abre uma conversa já com a pergunta enviada. */
export function QuickAsk() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = value.trim();
    if (!q) return;
    router.push(`/chat?q=${encodeURIComponent(q.slice(0, 1000))}`);
  };
  return (
    <form onSubmit={submit} className="flex items-center gap-1.5 rounded-full border border-line bg-surface p-1.5 pl-5 shadow-card focus-within:border-brand/50">
      <label htmlFor="quick-ask" className="sr-only">
        Pergunte à AgroIA
      </label>
      <input
        id="quick-ask"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Pergunte sobre o campo…"
        className="h-11 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-subtle"
        autoComplete="off"
        enterKeyHint="send"
      />
      <button
        type="submit"
        disabled={!value.trim()}
        className="grid size-11 shrink-0 place-items-center rounded-full bg-brand text-brand-fg transition hover:bg-brand-strong active:scale-95 disabled:opacity-40"
        aria-label="Perguntar"
      >
        <ArrowUp className="size-5" />
      </button>
    </form>
  );
}
