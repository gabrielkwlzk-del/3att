"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail, MailCheck } from "lucide-react";
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
};

export function LoginForm({ next, linkError }: { next: string; linkError: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("entrar");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(linkError ? "O link de acesso expirou ou é inválido. Peça um novo." : null);
  const [sent, setSent] = useState<string | null>(null);

  const redirectTo = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

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
      const code = (err as { code?: string }).code;
      setError((code && AUTH_ERRORS[code]) || "Não foi possível concluir agora. Verifique sua conexão e tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="rounded-3xl border border-line bg-surface p-6 text-center animate-pop" role="status">
        <MailCheck className="mx-auto size-10 text-leaf" aria-hidden />
        <p className="mt-3 font-medium">Confira seu e-mail</p>
        <p className="mt-1 text-sm text-muted">{sent}</p>
        <button type="button" onClick={() => setSent(null)} className="mt-4 text-sm font-medium text-brand">
          Usar outro e-mail
        </button>
      </div>
    );
  }

  const field = "h-12 w-full rounded-2xl border border-line bg-surface px-3.5 text-base outline-none transition focus:border-brand/60";

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid grid-cols-2 rounded-full bg-surface-2 p-1" role="tablist" aria-label="Acesso">
        {(["entrar", "criar"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m || (m === "entrar" && mode === "link")}
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            className={`h-10 rounded-full text-sm font-medium transition ${
              mode === m || (m === "entrar" && mode === "link") ? "bg-surface text-fg shadow-sm" : "text-muted"
            }`}
          >
            {m === "entrar" ? "Entrar" : "Criar conta"}
          </button>
        ))}
      </div>

      {mode === "criar" && (
        <div>
          <label htmlFor="nome" className="mb-1.5 block text-sm font-medium">Seu nome</label>
          <input id="nome" value={name} onChange={(e) => setName(e.target.value)} className={field} autoComplete="name" maxLength={80} />
        </div>
      )}

      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-medium">E-mail</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={field}
          autoComplete="email"
          inputMode="email"
          required
        />
      </div>

      {mode !== "link" && (
        <div>
          <label htmlFor="senha" className="mb-1.5 block text-sm font-medium">Senha</label>
          <input
            id="senha"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={field}
            autoComplete={mode === "criar" ? "new-password" : "current-password"}
            minLength={mode === "criar" ? 8 : undefined}
            required
          />
          {mode === "criar" && <p className="mt-1 text-xs text-subtle">Mínimo de 8 caracteres.</p>}
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-2xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading || !email || (mode !== "link" && !password)}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand font-medium text-brand-fg transition hover:bg-brand-strong active:scale-[0.99] disabled:opacity-50"
      >
        {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {mode === "entrar" ? "Entrar" : mode === "criar" ? "Criar conta" : "Enviar link de acesso"}
      </button>

      {mode !== "criar" && (
        <button
          type="button"
          onClick={() => {
            setMode(mode === "link" ? "entrar" : "link");
            setError(null);
          }}
          className="flex w-full items-center justify-center gap-2 text-sm font-medium text-brand"
        >
          <Mail className="size-4" aria-hidden />
          {mode === "link" ? "Entrar com senha" : "Entrar sem senha (link por e-mail)"}
        </button>
      )}
    </form>
  );
}
