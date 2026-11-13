import type { Metadata } from "next";
import Link from "next/link";
import { CloudSun, Leaf, MessageSquareText, PawPrint } from "lucide-react";
import { Logo, LogoMark } from "@/components/brand/logo";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

const FEATURES = [
  { icon: MessageSquareText, text: "Tire dúvidas de agricultura e pecuária em linguagem simples" },
  { icon: Leaf, text: "Envie fotos da lavoura e receba hipóteses e próximos passos" },
  { icon: CloudSun, text: "Previsão do tempo real com alertas de geada" },
  { icon: PawPrint, text: "Orientação de manejo para bovinos, suínos, aves e mais" },
];

export default async function LoginPage({ searchParams }: PageProps<"/entrar">) {
  const params = await searchParams;
  const rawNext = typeof params.next === "string" ? params.next : "/";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";
  const linkError = params.erro === "link";

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-[#0f3a22] p-12 text-[#f1f5ef] lg:flex lg:flex-col">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background:
              "radial-gradient(60% 50% at 20% 10%, rgba(143,209,158,0.25), transparent 60%), radial-gradient(50% 45% at 90% 90%, rgba(217,171,85,0.28), transparent 60%)",
          }}
          aria-hidden
        />
        <div className="relative">
          <span className="inline-flex items-center gap-2 text-lg font-semibold">
            <LogoMark className="size-9" />
            AgroIA
          </span>
        </div>
        <div className="relative mt-auto max-w-md">
          <h2 className="text-4xl leading-tight font-semibold tracking-tight text-balance">
            Inteligência para quem vive do campo.
          </h2>
          <ul className="mt-8 space-y-4">
            {FEATURES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3 text-[15px] text-[#d6e4d8]">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/10">
                  <Icon className="size-[18px]" aria-hidden />
                </span>
                <span className="pt-1.5">{text}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <main className="flex flex-col justify-center px-5 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-sm animate-fade-up">
          <Logo className="lg:hidden" />
          <h1 className="mt-8 text-2xl font-semibold tracking-tight lg:mt-0">Bem-vindo à AgroIA</h1>
          <p className="mt-1 mb-6 text-muted">Entre para salvar suas conversas e os dados da sua propriedade.</p>
          <LoginForm next={next} linkError={linkError} />
          <p className="mt-8 text-center text-xs text-subtle">
            Ao continuar, você concorda com o uso dos seus dados conforme a nossa{" "}
            <Link href="/privacidade" className="underline">política de privacidade</Link>.
          </p>
        </div>
      </main>
    </div>
  );
}
