"use client";

import { RotateCcw } from "lucide-react";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md px-6 py-16 text-center">
      <h1 className="text-xl font-semibold">Algo deu errado</h1>
      <p className="mt-2 text-muted">Não conseguimos carregar esta tela. Verifique sua conexão e tente novamente.</p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-brand px-5 font-medium text-brand-fg"
      >
        <RotateCcw className="size-4" aria-hidden /> Tentar de novo
      </button>
    </div>
  );
}
