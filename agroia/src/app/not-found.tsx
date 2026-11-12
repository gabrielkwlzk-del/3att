import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <Logo />
        <h1 className="mt-6 text-2xl font-semibold">Página não encontrada</h1>
        <p className="mt-2 text-muted">O endereço pode estar errado ou a conversa foi excluída.</p>
        <Link href="/" className="mt-6 inline-flex h-11 items-center rounded-full bg-brand px-5 font-medium text-brand-fg">
          Voltar ao início
        </Link>
      </div>
    </div>
  );
}
