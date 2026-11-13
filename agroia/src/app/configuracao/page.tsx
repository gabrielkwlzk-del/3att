import type { Metadata } from "next";
import { Logo } from "@/components/brand/logo";

export const metadata: Metadata = { title: "Configuração necessária" };

const REQUIRED = [
  ["NEXT_PUBLIC_SUPABASE_URL", "URL do projeto Supabase"],
  ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "Chave pública (anon) do Supabase"],
  ["ANTHROPIC_API_KEY", "Chave da API de IA (somente no servidor)"],
] as const;

/** Exibida quando o app roda sem as variáveis mínimas. Não mostra valores, só nomes. */
export default function SetupPage() {
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  return (
    <div className="mx-auto max-w-xl px-5 py-12">
      <Logo />
      <h1 className="mt-8 text-2xl font-semibold tracking-tight">Configuração necessária</h1>
      <p className="mt-2 text-muted">
        {configured
          ? "O Supabase está configurado. Volte para a página inicial."
          : "Esta instalação da AgroIA ainda não tem as variáveis de ambiente obrigatórias."}
      </p>
      <ol className="mt-6 space-y-3 text-sm">
        <li className="rounded-3xl border border-line bg-surface p-4">
          1. Copie <code className="font-mono">.env.example</code> para <code className="font-mono">.env.local</code> e preencha:
          <ul className="mt-2 space-y-1">
            {REQUIRED.map(([name, desc]) => (
              <li key={name}>
                <code className="font-mono font-medium">{name}</code> — <span className="text-muted">{desc}</span>
              </li>
            ))}
          </ul>
        </li>
        <li className="rounded-3xl border border-line bg-surface p-4">
          2. Rode a migração <code className="font-mono">supabase/migrations/…_init.sql</code> no SQL Editor do Supabase.
        </li>
        <li className="rounded-3xl border border-line bg-surface p-4">3. Reinicie o servidor. Detalhes no README.md.</li>
      </ol>
    </div>
  );
}
