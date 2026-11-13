"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="inline-flex h-11 items-center gap-2 rounded-full border border-line bg-surface px-5 text-sm font-medium transition hover:bg-surface-2">
      <Printer className="size-4" aria-hidden /> Imprimir ou salvar em PDF
    </button>
  );
}
