import type { Metadata } from "next";
import Link from "next/link";
import { CloudSun, Leaf, MessageSquareText, PawPrint, ShieldCheck } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

const FEATURES = [
  { icon: MessageSquareText, title: "Dúvidas do campo", text: "Agricultura e pecuária, em linguagem simples" },
  { icon: Leaf, title: "Fotos da lavoura", text: "Hipóteses com grau de confiança e próximos passos" },
  { icon: CloudSun, title: "Clima real", text: "Previsão, alertas de geada e janelas de pulverização" },
  { icon: PawPrint, title: "Criação de animais", text: "Manejo, nutrição e prevenção" },
];

export default async function LoginPage({ searchParams }: PageProps<"/entrar">) {
  const params = await searchParams;
  const rawNext = typeof params.next === "string" ? params.next : "/";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";
  const linkError = params.erro === "link";

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-[#0d3a22] p-10 text-[#eef5ee] lg:flex lg:flex-col xl:p-14">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(55% 45% at 15% 5%, rgba(143,209,158,0.28), transparent 65%), radial-gradient(45% 40% at 95% 100%, rgba(217,171,85,0.25), transparent 65%)",
          }}
          aria-hidden
        />
        <div className="relative flex items-center gap-3">
          <LogoMark className="size-11" />
          <span className="text-xl font-semibold tracking-tight">
            Agro<span className="text-[#8fd19e]">IA</span>
          </span>
        </div>

        <div className="relative mt-auto">
          <h2 className="max-w-lg text-4xl leading-[1.1] font-semibold tracking-tight text-balance xl:text-5xl">
            Inteligência para quem vive do campo.
          </h2>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-[#c9dccb]">
            Um assistente para tirar dúvidas, analisar fotos da lavoura e planejar o dia com a previsão real da sua
            região.
          </p>

          <ul className="mt-10 grid gap-3">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex items-center gap-4 rounded-[24px] bg-white/[0.06] p-4 ring-1 ring-white/10">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/10">
                  <Icon className="size-5 text-[#8fd19e]" aria-hidden />
                </span>
                <span>
                  <span className="block font-medium">{title}</span>
                  <span className="block text-sm text-[#b7cbba]">{text}</span>
                </span>
              </li>
            ))}
          </ul>

          <p className="mt-10 flex items-center gap-2 text-xs text-[#9fb8a4]">
            <ShieldCheck className="size-4" aria-hidden /> Suas conversas e fotos ficam só na sua conta.
          </p>
        </div>
      </aside>

      <main className="flex flex-col justify-center px-5 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-[400px]">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <LogoMark className="size-10" />
            <span className="text-xl font-semibold tracking-tight">
              Agro<span className="text-leaf">IA</span>
            </span>
          </div>

          <h1 className="text-[28px] leading-tight font-semibold tracking-tight">Bem-vindo de volta</h1>
          <p className="mt-2 mb-7 text-[15px] text-muted">
            Entre para continuar suas conversas e manter os dados da sua propriedade.
          </p>

          <LoginForm next={next} linkError={linkError} />

          <p className="mt-7 text-center text-xs leading-relaxed text-subtle">
            Ao continuar, você concorda com o uso dos seus dados conforme a nossa{" "}
            <Link href="/privacidade" className="font-medium text-muted underline underline-offset-2 hover:text-fg">
              política de privacidade
            </Link>
            .
          </p>
        </div>
      </main>
    </div>
  );
}
