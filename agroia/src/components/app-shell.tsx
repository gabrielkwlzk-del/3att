"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  CloudSun,
  Home,
  LogOut,
  MessageSquareText,
  MessagesSquare,
  Moon,
  PawPrint,
  Plus,
  Sun,
  SunMoon,
  Tractor,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/brand/logo";

const NAV = [
  { href: "/", label: "Início", icon: Home },
  { href: "/conversas", label: "Conversas", icon: MessagesSquare },
  { href: "/clima", label: "Clima", icon: CloudSun },
  { href: "/animais", label: "Animais", icon: PawPrint },
  { href: "/propriedade", label: "Propriedade", icon: Tractor },
] as const;

type Recent = { id: string; title: string };

export const CONVERSATIONS_CHANGED = "agroia:conversations-changed";

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children, userEmail }: { children: React.ReactNode; userEmail: string }) {
  const pathname = usePathname();
  const inChat = pathname === "/chat" || pathname.startsWith("/chat/");
  const [recents, setRecents] = useState<Recent[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await createClient()
        .from("conversations")
        .select("id, title")
        .order("updated_at", { ascending: false })
        .limit(12);
      if (!cancelled) setRecents((data as Recent[]) ?? []);
    };
    void load();
    const onChange = () => void load();
    window.addEventListener(CONVERSATIONS_CHANGED, onChange);
    return () => {
      cancelled = true;
      window.removeEventListener(CONVERSATIONS_CHANGED, onChange);
    };
  }, [pathname]);

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* Barra lateral (tablet/desktop) */}
      <aside className="hidden w-[272px] shrink-0 flex-col border-r border-line bg-surface/60 lg:flex">
        <div className="flex h-16 items-center px-5">
          <Link href="/" aria-label="AgroIA – início">
            <Logo />
          </Link>
        </div>
        <div className="px-3">
          <Link
            href="/chat"
            className="flex h-11 items-center justify-center gap-2 rounded-2xl bg-brand text-sm font-medium text-brand-fg transition hover:bg-brand-strong active:scale-[0.98]"
          >
            <Plus className="size-4" aria-hidden /> Nova conversa
          </Link>
        </div>
        <nav className="mt-4 space-y-0.5 px-3" aria-label="Principal">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex h-10 items-center gap-3 rounded-xl px-3 text-sm transition ${
                isActive(pathname, href) ? "bg-brand-soft font-medium text-brand" : "text-muted hover:bg-surface-2 hover:text-fg"
              }`}
              aria-current={isActive(pathname, href) ? "page" : undefined}
            >
              <Icon className="size-[18px]" aria-hidden /> {label}
            </Link>
          ))}
        </nav>
        <div className="mt-6 min-h-0 flex-1 overflow-y-auto px-3 scrollbar-thin">
          {recents.length > 0 && (
            <>
              <p className="px-3 pb-1.5 text-xs font-medium tracking-wide text-subtle uppercase">Recentes</p>
              <ul className="space-y-0.5">
                {recents.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/chat/${c.id}`}
                      className={`flex h-9 items-center gap-2.5 rounded-xl px-3 text-sm transition ${
                        pathname === `/chat/${c.id}` ? "bg-surface-2 text-fg" : "text-muted hover:bg-surface-2 hover:text-fg"
                      }`}
                    >
                      <MessageSquareText className="size-4 shrink-0 opacity-60" aria-hidden />
                      <span className="truncate">{c.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 border-t border-line p-3">
          <span className="min-w-0 flex-1 truncate px-2 text-xs text-subtle" title={userEmail}>
            {userEmail}
          </span>
          <ThemeToggle />
          <form action="/auth/sair" method="post">
            <button
              type="submit"
              className="grid size-9 place-items-center rounded-xl text-muted transition hover:bg-surface-2 hover:text-fg"
              aria-label="Sair da conta"
              title="Sair"
            >
              <LogOut className="size-[18px]" />
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Cabeçalho móvel */}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line/70 bg-bg/90 px-3 backdrop-blur lg:hidden">
          {inChat ? (
            <>
              <Link
                href="/"
                className="grid size-10 place-items-center rounded-full text-muted hover:bg-surface-2"
                aria-label="Voltar ao início"
              >
                <ArrowLeft className="size-5" />
              </Link>
              <span className="flex-1 truncate font-medium">AgroIA</span>
              <Link
                href="/chat"
                className="grid size-10 place-items-center rounded-full text-muted hover:bg-surface-2"
                aria-label="Nova conversa"
              >
                <Plus className="size-5" />
              </Link>
            </>
          ) : (
            <>
              <Link href="/" className="flex-1" aria-label="AgroIA – início">
                <Logo />
              </Link>
              <ThemeToggle />
            </>
          )}
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto scrollbar-thin" id="conteudo">
          {children}
        </main>

        {/* Navegação inferior (celular) */}
        {!inChat && (
          <nav
            className="grid shrink-0 grid-cols-5 border-t border-line bg-surface/95 backdrop-blur lg:hidden pb-safe"
            aria-label="Principal"
          >
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex h-16 flex-col items-center justify-center gap-1 text-[11px] transition ${
                    active ? "font-medium text-brand" : "text-subtle"
                  }`}
                  aria-current={active ? "page" : undefined}
                >
                  <span className={`grid h-7 w-12 place-items-center rounded-full transition ${active ? "bg-brand-soft" : ""}`}>
                    <Icon className="size-5" aria-hidden />
                  </span>
                  {label}
                </Link>
              );
            })}
          </nav>
        )}
      </div>
    </div>
  );
}

type ThemeChoice = "light" | "dark" | "system";

export function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>("system");

  useEffect(() => {
    try {
      const stored = localStorage.getItem("agroia-theme") as ThemeChoice | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (stored) setChoice(stored);
    } catch {
      // armazenamento indisponível
    }
  }, []);

  useEffect(() => {
    if (choice !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => (document.documentElement.dataset.theme = media.matches ? "dark" : "light");
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [choice]);

  const cycle = () => {
    const next: ThemeChoice = choice === "system" ? "light" : choice === "light" ? "dark" : "system";
    setChoice(next);
    try {
      localStorage.setItem("agroia-theme", next);
    } catch {
      // ignora
    }
    const dark = next === "dark" || (next === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  };

  const Icon = choice === "light" ? Sun : choice === "dark" ? Moon : SunMoon;
  const label = choice === "light" ? "Tema claro" : choice === "dark" ? "Tema escuro" : "Tema do sistema";
  return (
    <button
      type="button"
      onClick={cycle}
      className="grid size-9 place-items-center rounded-xl text-muted transition hover:bg-surface-2 hover:text-fg"
      aria-label={`${label} (toque para alternar)`}
      title={label}
    >
      <Icon className="size-[18px]" />
    </button>
  );
}
