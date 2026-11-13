/** Marca AgroIA (arquivo public/logo.png). */
export function LogoMark({ className = "size-8" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- ícone estático local
    <img src="/logo.png" alt="" aria-hidden="true" width={1254} height={1254} className={`${className} rounded-[22%] object-cover`} />
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
  return (
    // eslint-disable-next-line @next/next/no-img-element -- ícone estático local
    <img src="/logo.png" alt="" aria-hidden="true" width={1254} height={1254} className={`${className} shrink-0 rounded-full object-cover`} />
  );
}
