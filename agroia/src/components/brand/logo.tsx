/**
 * Marca AgroIA. No modo claro aparece a versão com fundo branco (public/logo.png);
 * no modo escuro, a versão com fundo preto (public/logo-dark.png).
 * A troca é feita por CSS (classes dark:), seguindo o data-theme do <html>.
 */
export function LogoMark({ className = "size-8", rounded = "rounded-[22%]" }: { className?: string; rounded?: string }) {
  return (
    <span className={`${className} ${rounded} inline-block shrink-0 overflow-hidden`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- ícone estático local */}
      <img src="/logo.png" alt="" aria-hidden="true" width={1254} height={1254} className="block size-full object-cover dark:hidden" />
      {/* eslint-disable-next-line @next/next/no-img-element -- ícone estático local */}
      <img src="/logo-dark.png" alt="" aria-hidden="true" width={1254} height={1254} className="hidden size-full object-cover dark:block" />
    </span>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark className="size-8" />
      <span className="text-lg font-semibold tracking-tight">
        Agro<span className="text-leaf">IA</span>
      </span>
    </span>
  );
}

export function AssistantAvatar({ className = "size-7" }: { className?: string }) {
  return <LogoMark className={className} rounded="rounded-full" />;
}
