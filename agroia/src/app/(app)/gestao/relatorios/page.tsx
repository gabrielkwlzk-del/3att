import type { Metadata } from "next";
import { Download, FileText, Sparkles } from "lucide-react";
import { getAuthContext } from "@/lib/supabase/server";
import { loadFields, loadSeasons, selectSeason } from "@/lib/farm/data";
import { buildReportData } from "@/lib/farm/report";
import { pctChange } from "@/lib/farm/finance";
import { formatDateBR, formatInt, formatMoney, formatNum1, formatPercent } from "@/lib/farm/format";
import { ActionForm } from "@/components/farm/forms";
import { BarList, GroupedBars } from "@/components/farm/charts";
import { PrintButton } from "@/components/farm/print-button";
import { Markdown } from "@/components/chat/markdown";
import { Badge, Card, EmptyState, Note, PageShell, SeasonTabs, Stat } from "@/components/farm/ui";
import { generateReportSummary } from "./actions";

export const metadata: Metadata = { title: "Relatórios" };
export const maxDuration = 120;

const KIND_LABEL: Record<string, string> = { plantio: "Plantios", aplicacao: "Aplicações", inspecao: "Inspeções", colheita: "Colheitas", irrigacao: "Irrigações", manutencao: "Manutenções", outro: "Outras" };

export default async function ReportsPage({ searchParams }: PageProps<"/gestao/relatorios">) {
  const { safra } = await searchParams;
  const { supabase } = await getAuthContext();
  const [seasons, fields] = await Promise.all([loadSeasons(supabase), loadFields(supabase)]);
  const { season } = selectSeason(seasons, safra);

  if (!season) {
    return (
      <PageShell title="Relatórios" description="Resumo da safra com custos, produtividade e operações.">
        <EmptyState icon={<FileText className="size-5" aria-hidden />} title="Crie uma safra para gerar o relatório" text="Em Talhões e safras, crie a safra e registre lançamentos e colheitas." />
      </PageShell>
    );
  }

  const [d, summaryRes] = await Promise.all([
    buildReportData(supabase, season, seasons, fields),
    supabase.from("report_summaries").select("content, model, created_at").eq("season_id", season.id).order("created_at", { ascending: false }).limit(1),
  ]);
  const saved = (summaryRes.data ?? [])[0] as { content: string; model: string | null; created_at: string } | undefined;
  const r = d.row;
  const p = d.previous;
  const csv = (tipo: string) => `/api/relatorios/csv?safra=${season.id}&tipo=${tipo}`;
  const delta = (cur: number | null, prev: number | null) => {
    const x = pctChange(cur, prev);
    return x == null ? undefined : `${x > 0 ? "+" : ""}${formatPercent(x)} vs ${p?.name}`;
  };

  return (
    <PageShell
      title={`Relatório · ${season.name}`}
      description={`Período: ${d.period.from ? formatDateBR(d.period.from) : "início"} a ${formatDateBR(d.period.to)}`}
      wide
      actions={<div className="flex flex-wrap gap-2 print:hidden"><PrintButton /></div>}
    >
      <div className="print:hidden"><SeasonTabs seasons={seasons} current={season.id} basePath="/gestao/relatorios" /></div>

      <section aria-label="Resumo financeiro" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Receita" value={formatMoney(r.summary.receita)} hint={delta(r.summary.receita, p?.summary.receita ?? null)} />
        <Stat label="Despesas" value={formatMoney(r.summary.despesa)} hint={delta(r.summary.despesa, p?.summary.despesa ?? null)} />
        <Stat label="Resultado" value={formatMoney(r.summary.resultado)} tone={r.summary.resultado < 0 ? "bad" : r.summary.resultado > 0 ? "good" : "default"} hint={`margem ${formatPercent(r.summary.margemPct)}`} />
        <Stat label="Investimentos" value={formatMoney(r.summary.investimento)} />
        <Stat label="Custo por hectare" value={r.custoPorHa != null ? formatMoney(r.custoPorHa) : "—"} hint={delta(r.custoPorHa, p?.custoPorHa ?? null)} />
        <Stat label={r.culturaPrincipal ? `Produtividade · ${r.culturaPrincipal}` : "Produtividade"} value={r.scPorHa != null ? `${formatNum1(r.scPorHa)} sc/ha` : "—"} hint={r.culturasMistas ? "cultura de maior área; veja por talhão" : p && p.culturaPrincipal === r.culturaPrincipal ? delta(r.scPorHa, p.scPorHa) : r.kgPorHa ? `${formatInt(r.kgPorHa)} kg/ha` : "sem colheita registrada"} />
        <Stat label="Custo por saca" value={r.custoPorSaca != null ? formatMoney(r.custoPorSaca) : "—"} hint={r.culturasMistas ? "só com uma cultura na safra" : "despesas ÷ sacas colhidas"} />
        <Stat label="Tarefas pendentes" value={String(d.operations.pending)} />
      </section>

      {p && (
        <Card title={`Comparação com ${p.name}`}>
          <GroupedBars
            caption="Receita e despesas"
            keys={["receita", "despesa"]}
            format={formatMoney}
            groups={[p, r].map((x) => ({ label: x.name, values: { receita: x.summary.receita, despesa: x.summary.despesa } }))}
          />
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Despesas por categoria">
          <BarList items={d.categories.map((c) => ({ label: c.category, value: c.cents, valueLabel: formatMoney(c.cents), hint: formatPercent(c.pct, 0) }))} emptyText="Nenhuma despesa lançada nesta safra." />
        </Card>
        <Card title="Produtividade por talhão">
          {d.productivity.length === 0 ? (
            <p className="text-sm text-muted">Nenhuma colheita registrada nesta safra.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead><tr className="text-xs text-muted"><th className="py-1.5 pr-3 font-medium">Talhão</th><th className="px-2 py-1.5 text-right font-medium">Área</th><th className="px-2 py-1.5 text-right font-medium">kg/ha</th><th className="py-1.5 pl-2 text-right font-medium">sc/ha</th></tr></thead>
                <tbody>
                  {d.productivity.map((x) => (
                    <tr key={x.fieldId} className="border-t border-line">
                      <th scope="row" className="py-2 pr-3 font-medium">{x.name}<span className="block text-xs font-normal text-subtle">{x.crop}</span></th>
                      <td className="px-2 py-2 text-right tabular-nums">{formatNum1(x.areaHectares)} ha</td>
                      <td className="px-2 py-2 text-right tabular-nums">{formatInt(x.kgHa)}</td>
                      <td className="py-2 pl-2 text-right tabular-nums">{formatNum1(x.scHa)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Operações concluídas">
          {Object.keys(d.operations.byKind).length === 0 ? (
            <p className="text-sm text-muted">Nenhuma operação concluída no período.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {Object.entries(d.operations.byKind).map(([k, n]) => <li key={k}><Badge tone="ok">{KIND_LABEL[k] ?? k}: {n}</Badge></li>)}
            </ul>
          )}
          {d.operations.applications.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-1.5 text-sm font-semibold">Registro de aplicações</h3>
              <ul className="divide-y divide-line text-sm">
                {d.operations.applications.map((a, i) => (
                  <li key={i} className="py-2">
                    <p className="font-medium">{a.product ?? "Aplicação"}{a.field ? ` · ${a.field}` : ""}</p>
                    <p className="text-muted">{formatDateBR(a.date)}{a.dose ? ` · dose: ${a.dose}` : ""}{a.target ? ` · alvo: ${a.target}` : ""}{a.withdrawalDays != null ? ` · carência: ${a.withdrawalDays} d` : ""}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
        <Card title="Irrigação e máquinas">
          {d.irrigation.length === 0 ? <p className="text-sm text-muted">Nenhuma irrigação registrada no período.</p> : (
            <ul className="space-y-1 text-sm">{d.irrigation.map((x) => <li key={x.field} className="flex justify-between gap-3"><span>{x.field}</span><span className="tabular-nums text-muted">{formatNum1(x.mm)} mm</span></li>)}</ul>
          )}
          <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
            <div className="rounded-2xl bg-surface-2/70 p-3"><dt className="text-xs text-muted">Horas de máquina</dt><dd className="font-semibold tabular-nums">{formatNum1(d.machines.hours)} h</dd></div>
            <div className="rounded-2xl bg-surface-2/70 p-3"><dt className="text-xs text-muted">Combustível</dt><dd className="font-semibold tabular-nums">{formatMoney(d.machines.fuelCostCents)}</dd></div>
            <div className="rounded-2xl bg-surface-2/70 p-3"><dt className="text-xs text-muted">Manutenção</dt><dd className="font-semibold tabular-nums">{formatMoney(d.machines.maintenanceCostCents)}</dd></div>
          </dl>
        </Card>
      </div>

      <Card title="Resumo com IA" aside={saved ? <Badge tone="muted">{formatDateBR(saved.created_at)}</Badge> : undefined}>
        {saved ? <Markdown>{saved.content}</Markdown> : <p className="text-sm text-muted">Gere um resumo em linguagem simples com os pontos fortes, os pontos de atenção e os próximos passos desta safra.</p>}
        <div className="mt-4 print:hidden">
          <ActionForm action={generateReportSummary} submitLabel={saved ? "Gerar novo resumo" : "Gerar resumo com IA"} resetOnSuccess={false}>
            <input type="hidden" name="season_id" value={season.id} />
            <p className="flex items-start gap-2 text-xs text-subtle"><Sparkles className="mt-0.5 size-3.5 shrink-0" aria-hidden /> Os números desta safra (sem nomes de pessoas) são enviados ao serviço de IA. O resumo não recomenda produtos nem doses.</p>
          </ActionForm>
        </div>
      </Card>

      <Card title="Exportar dados" className="print:hidden">
        <div className="flex flex-wrap gap-2">
          {[["resumo", "Resumo"], ["lancamentos", "Lançamentos"], ["colheitas", "Colheitas"], ["operacoes", "Aplicações"]].map(([tipo, label]) => (
            <a key={tipo} href={csv(tipo)} className="inline-flex h-11 items-center gap-2 rounded-full border border-line px-4 text-sm font-medium transition hover:bg-surface-2"><Download className="size-4" aria-hidden /> {label} (CSV)</a>
          ))}
        </div>
        <p className="mt-3 text-xs text-subtle">Os arquivos CSV abrem no Excel e no Google Planilhas. Para PDF, use &ldquo;Imprimir ou salvar em PDF&rdquo; e escolha &ldquo;Salvar como PDF&rdquo;.</p>
      </Card>

      <Note>
        Os indicadores por hectare usam {r.areaBasis === "talhoes" ? "a área dos talhões com colheita ou lançamento na safra" : r.areaBasis === "todos" ? "a área total dos talhões" : "a área dos talhões (cadastre-os para calcular)"}.
        Operações, irrigação e máquinas consideram o período da safra{d.period.from ? "" : " (sem data de início: tudo até hoje)"}.
      </Note>
    </PageShell>
  );
}
