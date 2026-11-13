"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, Mail, MailCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Mode = "entrar" | "criar" | "link";

const AUTH_ERRORS: Record<string, string> = {
  invalid_credentials: "E-mail ou senha incorretos.",
  email_not_confirmed: "Confirme seu e-mail pelo link que enviamos antes de entrar.",
  user_already_exists: "Já existe uma conta com este e-mail. Use a opção Entrar.",
  email_exists: "Já existe uma conta com este e-mail. Use a opção Entrar.",
  weak_password: "Escolha uma senha mais forte (mínimo de 8 caracteres, misture letras e números).",
  over_email_send_rate_limit: "Muitos e-mails enviados. Aguarde alguns minutos e tente novamente.",
  over_request_rate_limit: "Muitas tentativas. Aguarde alguns minutos.",
  email_address_invalid: "Este e-mail não é válido.",
  signup_disabled: "Novos cadastros estão desativados no momento.",
  provider_disabled: "Entrar com o Google ainda não está ativo. Use e-mail e senha por enquanto.",
  oauth_provider_not_supported: "Entrar com o Google ainda não está ativo. Use e-mail e senha por enquanto.",
};

function errorFrom(err: unknown, fallback: string): string {
  const code = (err as { code?: string }).code;
  return (code && AUTH_ERRORS[code]) || fallback;
}

/** Logo oficial do Google em cores (4 cores da marca). */
function GoogleIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
    </svg>
  );
}

export function LoginForm({ next, linkError }: { next: string; linkError: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("entrar");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    linkError ? "O link de acesso expirou ou é inválido. Peça um novo." : null,
  );
  const [sent, setSent] = useState<string | null>(null);

  const redirectTo = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  const signInWithGoogle = async () => {
    setGoogleLoading(true);
    setError(null);
    const { error: err } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectTo() },
    });
    // Se der certo, o navegador segue para o Google; daqui só sai erro.
    if (err) {
      setError(errorFrom(err, "Não foi possível entrar com o Google agora. Tente novamente."));
      setGoogleLoading(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    try {
      if (mode === "entrar") {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
        router.replace(next);
        router.refresh();
        return;
      }
      if (mode === "criar") {
        if (password.length < 8) {
          setError("A senha precisa ter pelo menos 8 caracteres.");
          return;
        }
        const { data, error: err } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirectTo(), data: { display_name: name.trim().slice(0, 80) } },
        });
        if (err) throw err;
        if (data.session) {
          router.replace(next);
          router.refresh();
          return;
        }
        setSent("Enviamos um link de confirmação para o seu e-mail. Abra-o para ativar a conta.");
        return;
      }
      const { error: err } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo(), shouldCreateUser: true },
      });
      if (err) throw err;
      setSent("Enviamos um link de acesso para o seu e-mail. Abra-o neste aparelho para entrar.");
    } catch (err) {
      setError(errorFrom(err, "Não foi possível concluir agora. Verifique sua conexão e tente novamente."));
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="animate-pop rounded-[28px] border border-line bg-surface p-7 text-center shadow-card" role="status">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-brand-soft">
          <MailCheck className="size-7 text-brand" aria-hidden />
        </span>
        <p className="mt-4 text-lg font-semibold">Confira seu e-mail</p>
        <p className="mt-1.5 text-sm text-muted">{sent}</p>
        <button
          type="button"
          onClick={() => setSent(null)}
          className="mt-5 h-11 rounded-full px-5 text-sm font-medium text-brand transition hover:bg-brand-soft"
        >
          Usar outro e-mail
        </button>
      </div>
    );
  }

  const field =
    "h-12 w-full rounded-3xl border border-line bg-bg px-4 text-base outline-none transition placeholder:text-subtle focus:border-brand focus:ring-4 focus:ring-[var(--ring)]";
  const showPasswordField = mode !== "link";
  const primaryLabel = mode === "entrar" ? "Entrar" : mode === "criar" ? "Criar conta" : "Enviar link de acesso";

  return (
    <div className="animate-fade-up rounded-[28px] border border-line bg-surface p-5 shadow-card sm:p-7">
      <button
        type="button"
        onClick={signInWithGoogle}
        disabled={googleLoading || loading}
        className="flex h-12 w-full items-center justify-center gap-3 rounded-full border border-line bg-surface text-[15px] font-medium transition hover:bg-surface-2 active:scale-[0.99] disabled:opacity-60"
      >
        {googleLoading ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <GoogleIcon />}
        Continuar com Google
      </button>

      <div className="my-5 flex items-center gap-3 text-xs text-subtle" role="separator">
        <span className="h-px flex-1 bg-line" />
        ou com e-mail
        <span className="h-px flex-1 bg-line" />
      </div>

      <div className="grid grid-cols-2 rounded-full bg-surface-2 p-1" role="tablist" aria-label="Tipo de acesso">
        {(["entrar", "criar"] as const).map((m) => {
          const active = mode === m || (m === "entrar" && mode === "link");
          return (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={`h-10 rounded-full text-sm font-medium transition ${
                active ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg"
              }`}
            >
              {m === "entrar" ? "Entrar" : "Criar conta"}
            </button>
          );
        })}
      </div>

      <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
        {mode === "criar" && (
          <div>
            <label htmlFor="nome" className="mb-1.5 block text-sm font-medium">
              Seu nome
            </label>
            <input
              id="nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={field}
              autoComplete="name"
              maxLength={80}
              placeholder="Como você quer ser chamado"
            />
          </div>
        )}

        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
            E-mail
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={field}
            autoComplete="email"
            inputMode="email"
            placeholder="voce@exemplo.com"
            required
          />
        </div>

        {showPasswordField && (
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="senha" className="text-sm font-medium">
                Senha
              </label>
              {mode === "criar" && <span className="text-xs text-subtle">mínimo de 8 caracteres</span>}
            </div>
            <div className="relative">
              <input
                id="senha"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${field} pr-12`}
                autoComplete={mode === "criar" ? "new-password" : "current-password"}
                minLength={mode === "criar" ? 8 : undefined}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute top-1/2 right-2 grid size-9 -translate-y-1/2 place-items-center rounded-full text-muted transition hover:bg-surface-2 hover:text-fg"
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              >
                {showPassword ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
              </button>
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-3xl bg-danger-soft px-4 py-3 text-sm text-danger">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || googleLoading || !email || (showPasswordField && !password)}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand font-medium text-brand-fg transition hover:bg-brand-strong active:scale-[0.99] disabled:opacity-50"
        >
          {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {primaryLabel}
        </button>
      </form>

      {mode !== "criar" && (
        <button
          type="button"
          onClick={() => {
            setMode(mode === "link" ? "entrar" : "link");
            setError(null);
          }}
          className="mx-auto mt-4 flex h-10 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium text-brand transition hover:bg-brand-soft"
        >
          <Mail className="size-4" aria-hidden />
          {mode === "link" ? "Entrar com senha" : "Entrar sem senha (link por e-mail)"}
        </button>
      )}
    </div>
  );
}
