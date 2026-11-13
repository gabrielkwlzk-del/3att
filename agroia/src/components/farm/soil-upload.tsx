"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { analyzeSoilReport } from "@/app/(app)/gestao/solo/actions";
import { fieldClass } from "./forms";

const MAX_BYTES = 10 * 1024 * 1024;

export function SoilUpload({ userId, fields }: { userId: string; fields: { value: string; label: string }[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fieldId, setFieldId] = useState("");
  const [sampleOn, setSampleOn] = useState("");
  const [phase, setPhase] = useState<"idle" | "uploading" | "analyzing">("idle");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResult(null);
    const file = fileRef.current?.files?.[0];
    if (!file) return setResult({ ok: false, message: "Escolha o PDF do laudo." });
    if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) return setResult({ ok: false, message: "O arquivo precisa ser um PDF." });
    if (file.size > MAX_BYTES) return setResult({ ok: false, message: "O PDF pode ter no máximo 10 MB." });

    const path = `${userId}/${crypto.randomUUID()}.pdf`;
    setPhase("uploading");
    const { error } = await createClient().storage.from("soil-reports").upload(path, file, { contentType: "application/pdf", upsert: false });
    if (error) {
      setPhase("idle");
      return setResult({ ok: false, message: "Não foi possível enviar o arquivo. Verifique a conexão e tente novamente." });
    }
    setPhase("analyzing");
    try {
      const r = await analyzeSoilReport({ path, fileName: file.name, fieldId, sampleOn });
      setResult(r);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch {
      setResult({ ok: false, message: "A análise demorou mais que o esperado. Atualize a página para ver o resultado." });
    } finally {
      setPhase("idle");
    }
  };

  const busy = phase !== "idle";
  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="soil-file" className="mb-1.5 block text-sm font-medium">Laudo em PDF</label>
        <input id="soil-file" ref={fileRef} type="file" accept="application/pdf,.pdf" disabled={busy} className="block w-full rounded-3xl border border-dashed border-line bg-surface-2/50 p-3 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-brand file:px-4 file:py-2 file:text-sm file:font-medium file:text-brand-fg" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="soil-field" className="mb-1.5 block text-sm font-medium">Talhão <span className="text-xs font-normal text-subtle">opcional</span></label>
          <select id="soil-field" value={fieldId} onChange={(e) => setFieldId(e.target.value)} disabled={busy} className={fieldClass}>
            <option value="">Não informar</option>
            {fields.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="soil-date" className="mb-1.5 block text-sm font-medium">Data da coleta <span className="text-xs font-normal text-subtle">opcional</span></label>
          <input id="soil-date" type="date" value={sampleOn} onChange={(e) => setSampleOn(e.target.value)} disabled={busy} className={fieldClass} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy} className="inline-flex h-12 items-center gap-2 rounded-full bg-brand px-6 text-[15px] font-medium text-brand-fg transition hover:bg-brand-strong disabled:opacity-60">
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <FileUp className="size-4" aria-hidden />}
          {phase === "uploading" ? "Enviando…" : phase === "analyzing" ? "Analisando (pode levar 1 minuto)…" : "Enviar e analisar"}
        </button>
        {result && <p role={result.ok ? "status" : "alert"} className={`text-sm ${result.ok ? "text-leaf" : "text-danger"}`}>{result.message}</p>}
      </div>
      <p className="text-xs text-subtle">O PDF é enviado para a IA para leitura. Fica guardado na sua conta, em pasta privada, e você pode excluí-lo quando quiser.</p>
    </form>
  );
}
