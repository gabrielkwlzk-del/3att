export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-8 sm:px-6" role="status" aria-label="Carregando">
      <div className="h-8 w-2/3 animate-pulse rounded-2xl bg-surface-2" />
      <div className="mt-6 space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-[28px] bg-surface-2" />
        ))}
      </div>
    </div>
  );
}
