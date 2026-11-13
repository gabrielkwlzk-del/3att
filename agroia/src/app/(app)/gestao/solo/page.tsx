import type { Metadata } from "next";
import Link from "next/link";
import { FlaskConical, MessageCircle, Trash2 } from "lucide-react";
import { getAuthContext } from "@/lib/supabase/server";
import { loadFields, optionsOf } from "@/lib/farm/data";
import { formatDateBR } from "@/lib/farm/format";
import { SoilAnalysisSchema, type SoilAnalysis } from "@/lib/ai/farm-ai";
import { SoilUpload } from "@/components/farm/soil-upload";
import { AddPanel, RowAction } from "@/components/farm/forms";
import { Badge, Card, EmptyState, Note, PageShell } from "@/components/farm/ui";
import { deleteSoilReport } from "./actions";

export const metadata: Metadata = { title: "Análise de solo" };
// A leitura do PDF pela IA pode levar mais de um minuto.
export const maxDuration = 300;

type ReportRow = { id: string; field_id: string | null; sample_on: string | null; file_path: string; file_name: string; status: "processing" | "done" | "error"; analysis: unknown; model: string | null; error: string | null; created_at: string };

const CLASS: Record<string, { label: string; tone: "danger" | "warn" | "ok" | "info" | "muted" }> = {
  muito_baixo: { label: "Muito baixo", tone: "danger" },
  baixo: { label: "Baixo", tone: "warn" },
  medio: { label: "Médio", tone: "info" },
  adequado: { label: "Adequado", tone: "ok" },
  alto: { label: "Alto", tone: "info" },
  muito_alto: { label: "Muito alto", tone: "warn" },
  nao_classificado: { label: "Sem classificação", tone: "muted" },
};

export default async function SoilPage() {
  const { supabase, user } = await getAuthContext();
  const [fields, res] = await Promise.all([
    loadFields(supabase),
    supabase.from("soil_reports").select("id, field_id, sample_on, file_path, file_name, status, analysis, model, error, created_at").order("created_at", { ascending: false }).limit(20),
  ]);
  const reports = (res.data ?? []) as ReportRow[];
  const fieldName = new Map(fields.map((f) => [f.id, f.name]));
  const signed = new Map<string, string>();
  if (reports.length) {
    const { data } = await supabase.storage.from("soil-reports").createSignedUrls(reports.map((r) => r.file_path), 3600);
    for (const s of data ?? []) if (s.path && s.signedUrl) signed.set(s.path, s.signedUrl);
  }

  return (
    <PageShell title="Análise de solo" description="Envie o laudo do laboratório em PDF e a IA explica os indicadores, aponta possíveis limitações e sugere perguntas para o agrônomo.">
      <AddPanel title="Enviar laudo (PDF)" defaultOpen={reports.length === 0}>
        <SoilUpload userId={user!.id} fields={optionsOf(fields)} />
      </AddPanel>

      <Note tone="warn">
        A IA <strong>explica</strong> o laudo; ela não recomenda doses de calcário, gesso ou adubo. A recomendação de correção e adubação precisa de um engenheiro agrônomo, que considera a cultura, a produtividade esperada e as condições da área.
      </Note>

      {reports.length === 0 ? (
        <EmptyState icon={<FlaskConical className="size-5" aria-hidden />} title="Nenhum laudo enviado" text="Envie um laudo de análise de solo em PDF para ver a interpretação aqui." />
      ) : (
        reports.map((r) => {
          const parsed = r.status === "done" ? SoilAnalysisSchema.safeParse(r.analysis) : null;
          const a: SoilAnalysis | null = parsed?.success ? parsed.data : null;
          return (
            <Card key={r.id} title={r.file_name} aside={<RowAction action={deleteSoilReport} id={r.id} label="Excluir laudo" icon={<Trash2 className="size-4" />} confirm="Excluir este laudo e a análise?" />}>
              <p className="-mt-2 mb-3 text-sm text-muted">
                {r.field_id && fieldName.get(r.field_id) ? `${fieldName.get(r.field_id)} · ` : ""}
                {r.sample_on ? `coleta ${formatDateBR(r.sample_on)}` : `enviado em ${formatDateBR(r.created_at)}`}
                {signed.get(r.file_path) && <> · <a href={signed.get(r.file_path)} target="_blank" rel="noopener noreferrer" className="font-medium text-brand underline">abrir PDF</a></>}
              </p>
              {r.status === "processing" && <p className="text-sm text-muted">Análise em andamento… atualize a página em instantes.</p>}
              {r.status === "error" && <p role="alert" className="rounded-3xl bg-danger-soft px-4 py-3 text-sm text-danger">{r.error ?? "Não foi possível analisar este laudo."}</p>}
              {r.status === "done" && !a && <p className="text-sm text-muted">Não foi possível ler esta análise. Envie o laudo novamente.</p>}
              {a && <SoilAnalysisView a={a} />}
            </Card>
          );
        })
      )}
    </PageShell>
  );
}

function SoilAnalysisView({ a }: { a: SoilAnalysis }) {
  const chatQuestion = `Tenho um laudo de solo com estes indicadores: ${a.indicators.slice(0, 14).map((i) => `${i.symbol ?? i.name} ${i.value ?? "?"}${i.unit ? ` ${i.unit}` : ""}`).join("; ")}. Pode me explicar os pontos de atenção e o que perguntar ao agrônomo?`.slice(0, 950);
  return (
    <div className="space-y-5">
      {!a.is_soil_report && <Note tone="warn">O arquivo enviado não parece ser um laudo de análise de solo.</Note>}
      <p className="text-[15px] leading-relaxed">{a.summary}</p>
      {(a.laboratory || a.depth || a.identification) && (
        <p className="text-xs text-subtle">{[a.laboratory && `Laboratório: ${a.laboratory}`, a.identification && `Amostra: ${a.identification}`, a.depth && `Profundidade: ${a.depth}`].filter(Boolean).join(" · ")}</p>
      )}

      {a.indicators.length > 0 && (
        <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line" aria-label="Indicadores do laudo">
          {a.indicators.map((i, idx) => {
            const c = CLASS[i.classification] ?? CLASS.nao_classificado;
            return (
              <li key={`${i.name}-${idx}`} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {i.name}
                    {i.symbol && i.symbol !== i.name && <span className="ml-1 text-xs font-normal text-subtle">({i.symbol})</span>}
                  </p>
                  {i.note && <p className="mt-0.5 text-xs text-subtle">{i.note}</p>}
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-semibold tabular-nums">{i.value ?? "—"}{i.unit ? <span className="ml-1 text-xs font-normal text-muted">{i.unit}</span> : null}</p>
                  <div className="mt-1"><Badge tone={c.tone}>{c.label}</Badge></div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {a.limitations.length > 0 && (
        <section>
          <h3 className="mb-1.5 text-sm font-semibold">Possíveis limitações</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted marker:text-leaf">{a.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul>
        </section>
      )}
      {a.questions_for_agronomist.length > 0 && (
        <section>
          <h3 className="mb-1.5 text-sm font-semibold">Para levar ao agrônomo</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted marker:text-wheat">{a.questions_for_agronomist.map((q, i) => <li key={i}>{q}</li>)}</ul>
        </section>
      )}
      {a.quality_notes && <p className="text-xs text-subtle">Sobre a leitura do documento: {a.quality_notes}</p>}
      <Link href={`/chat?topico=agricultura&q=${encodeURIComponent(chatQuestion)}`} className="inline-flex h-11 items-center gap-2 rounded-full border border-line px-5 text-sm font-medium transition hover:bg-surface-2">
        <MessageCircle className="size-4" aria-hidden /> Conversar sobre este laudo
      </Link>
    </div>
  );
}
