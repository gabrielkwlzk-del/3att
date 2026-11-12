export function LogoMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="16" className="fill-brand" />
      <path d="M32 50c0-14 6-24 18-28-1 13-7 22-18 28z" fill="#8fd19e" />
      <path d="M32 50c0-11-5-19-15-23 1 11 6 18 15 23z" fill="#d9ab55" />
      <path d="M32 52V24" stroke="#f5f3ec" strokeWidth="3" strokeLinecap="round" />
    </svg>
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
    <span className={`grid shrink-0 place-items-center rounded-full bg-brand-soft ${className}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" className="size-[60%]">
        <path d="M12 20c0-6 2.5-10 7.5-11.5C19 14 16.5 17.5 12 20z" className="fill-leaf" />
        <path d="M12 20c0-4.6-2-7.6-6.2-9.2.4 4.6 2.5 7.3 6.2 9.2z" className="fill-wheat" />
      </svg>
    </span>
  );
}
