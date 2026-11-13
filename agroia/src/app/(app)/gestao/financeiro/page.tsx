import type { Metadata } from "next";
import { Receipt, Trash2 } from "lucide-react";
import { getAuthContext } from "@/lib/supabase/server";
import { loadFields, loadSeasons, optionsOf, selectSeason } from "@/lib/farm/data";
import { byCategory, byField, compareSeasons, pctChange, seasonRow, summarize, type Harvest, type Tx } from "@/lib/farm/finance";
import { ALL_CATEGORIES, TX_KINDS } from "@/lib/farm/categories";
import { formatDateBR, formatMoney, formatNum1, formatPercent, todayBR } from "@/lib/farm/format";
import type { HarvestUnit } from "@/lib/farm/units";
import { ActionForm, AddPanel, DateField, FieldGrid, MoneyField, RowAction, SelectField, TextField } from "@/components/farm/forms";
import { BarList, GroupedBars } from "@/components/farm/charts";
import { Badge, Card, EmptyState, List, ListRow, Note, PageShell, SeasonTabs, Stat } from "@/components/farm/ui";
import { createTransaction, deleteTransaction } from "./actions";

export const metadata: Metadata = { title: "Financeiro" };

type TxRow = { id: string; season_id: string | null; field_id: string | null; kind: Tx["kind"]; category: string; description: string | null; amount_cents: number; occurred_on: string };

export default async function FinancePage({ searchParams }: PageProps<"/gestao/financeiro">) {
  const { safra } = await searchParams;
  const { supabase } = await getAuthContext();
  const [fields, seasons, txRes, harvestRes] = await Promise.all([
    loadFields(supabase),
    loadSeasons(supabase),
    supabase.from("transactions").select("id, season_id, field_id, kind, category, description, amount_cents, occurred_on").order("occurred_on", { ascending: false }).limit(5000),
    supabase.from("harvests").select("season_id, field_id, amount, unit, crop").limit(5000),
  ]);
  const { season, all } = selectSeason(seasons, safra);
  const rows = (txRes.data ?? []) as TxRow[];
  const allTxs: Tx[] = rows.map((t) => ({ kind: t.kind, amountCents: Number(t.amount_cents), seasonId: t.season_id, fieldId: t.field_id, category: t.category, occurredOn: t.occurred_on }));
  const harvests: Harvest[] = ((harvestRes.data ?? []) as { season_id: string; field_id: string; amount: number; unit: HarvestUnit; crop: string }[]).map((h) => ({ seasonId: h.season_id, fieldId: h.field_id, amount: Number(h.amount), unit: h.unit, crop: h.crop }));
  const fieldAreas = fields.map((f) => ({ id: f.id, name: f.name, areaHectares: f.areaHectares }));

  const scope = season ? rows.filter((t) => t.season_id === season.id) : rows;
  const scopeTxs = allTxs.filter((_, i) => (season ? rows[i].season_id === season.id : true));
  const summary = summarize(scopeTxs);
  const totalArea = fieldAreas.reduce((s, f) => s + f.areaHectares, 0);
  const sRow = season ? seasonRow({ id: season.id, name: season.name, startDate: season.startDate }, allTxs, harvests, fieldAreas) : null;
  const costPerHa = sRow ? sRow.custoPorHa : totalArea > 0 ? Math.round(summary.despesa / totalArea) : null;
  const areaNote = sRow
    ? sRow.areaBasis === "talhoes" ? "área dos talhões da safra" : sRow.areaBasis === "todos" ? "área total dos talhões" : undefined
    : totalArea > 0 ? "área total dos talhões" : undefined;

  const categories = byCategory(scopeTxs, "despesa");
  const perField = byField(scopeTxs, fieldAreas);
  const comparison = compareSeasons(seasons.map((s) => ({ id: s.id, name: s.name, startDate: s.startDate })), allTxs, harvests, fieldAreas);
  const seasonOptions = optionsOf(seasons);

  return (
    <PageShell title="Financeiro" description="Despesas, receitas e investimentos por safra, com custo por hectare e margem." wide>
      <SeasonTabs seasons={seasons} current={season?.id ?? null} basePath="/gestao/financeiro" allLabel="Todas" />

      <AddPanel title="Novo lançamento" defaultOpen={rows.length === 0}>
        <ActionForm action={createTransaction} submitLabel="Salvar lançamento">
          <FieldGrid cols={3}>
            <SelectField name="kind" label="Tipo" required defaultValue="despesa" options={TX_KINDS} />
            <TextField name="category" label="Categoria" placeholder="Ex.: Sementes" suggestions={ALL_CATEGORIES} required />
            <MoneyField name="amount_cents" label="Valor" required />
            <DateField name="occurred_on" label="Data" required defaultValue={todayBR()} />
            <SelectField name="season_id" label="Safra" defaultValue={season?.id ?? ""} options={seasonOptions} emptyLabel="Sem safra" />
            <SelectField name="field_id" label="Talhão" options={optionsOf(fields)} emptyLabel="Geral (sem talhão)" />
          </FieldGrid>
          <TextField name="description" label="Descrição" hint="opcional" placeholder="Ex.: 40 sacas de semente, nota 1234" />
        </ActionForm>
      </AddPanel>

      {rows.length === 0 ? (
        <EmptyState icon={<Receipt className="size-5" aria-hidden />} title="Nenhum lançamento ainda" text="Registre despesas, receitas e investimentos para ver o resultado, a margem e o custo por hectare." />
      ) : (
        <>
          <section aria-label="Resumo" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Receita" value={formatMoney(summary.receita)} />
            <Stat label="Despesas" value={formatMoney(summary.despesa)} />
            <Stat label="Investimentos" value={formatMoney(summary.investimento)} hint="fora do resultado operacional" />
            <Stat label="Resultado" value={formatMoney(summary.resultado)} tone={summary.resultado < 0 ? "bad" : summary.resultado > 0 ? "good" : "default"} hint="receita − despesas" />
            <Stat label="Margem de lucro" value={formatPercent(summary.margemPct)} tone={summary.margemPct != null && summary.margemPct < 0 ? "bad" : "default"} hint={summary.margemPct == null ? "sem receita lançada" : "resultado ÷ receita"} />
            <Stat label="Custo por hectare" value={costPerHa != null ? formatMoney(costPerHa) : "—"} hint={areaNote ?? "cadastre os talhões"} />
          </section>
          {summary.investimento > 0 && (
            <Note>
              Depois dos investimentos, o resultado é de <strong>{formatMoney(summary.resultadoAposInvestimento)}</strong>.
            </Note>
          )}

          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="Despesas por categoria">
              <BarList items={categories.map((c) => ({ label: c.category, value: c.cents, valueLabel: formatMoney(c.cents), hint: formatPercent(c.pct, 0) }))} emptyText="Nenhuma despesa lançada." />
            </Card>
            <Card title="Por talhão">
              {perField.length === 0 ? (
                <p className="text-sm text-muted">Sem lançamentos.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="text-xs text-muted">
                        <th className="py-1.5 pr-3 font-medium">Talhão</th>
                        <th className="px-2 py-1.5 text-right font-medium">Despesas</th>
                        <th className="px-2 py-1.5 text-right font-medium">Custo/ha</th>
                        <th className="py-1.5 pl-2 text-right font-medium">Resultado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {perField.map((f) => (
                        <tr key={f.fieldId ?? "geral"} className="border-t border-line">
                          <th scope="row" className="py-2 pr-3 font-medium">
                            {f.name}
                            {f.areaHectares && <span className="block text-xs font-normal text-subtle">{formatNum1(f.areaHectares)} ha</span>}
                          </th>
                          <td className="px-2 py-2 text-right whitespace-nowrap tabular-nums">{formatMoney(f.despesa)}</td>
                          <td className="px-2 py-2 text-right whitespace-nowrap tabular-nums">{f.custoPorHa != null ? formatMoney(f.custoPorHa) : "—"}</td>
                          <td className={`py-2 pl-2 text-right whitespace-nowrap tabular-nums ${f.resultado < 0 ? "text-danger" : ""}`}>{formatMoney(f.resultado)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>

          <Card title={all ? "Lançamentos (todas as safras)" : `Lançamentos · ${season?.name ?? "sem safra"}`}>
            {scope.length === 0 ? (
              <p className="text-sm text-muted">Nenhum lançamento neste filtro.</p>
            ) : (
              <List>
                {scope.slice(0, 40).map((t) => (
                  <ListRow key={t.id} actions={<RowAction action={deleteTransaction} id={t.id} label="Excluir lançamento" icon={<Trash2 className="size-4" />} confirm="Excluir este lançamento?" />}>
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 font-medium">{t.category}</p>
                      <p className="shrink-0 font-semibold whitespace-nowrap tabular-nums">{formatMoney(Number(t.amount_cents))}</p>
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
                      <Badge tone={t.kind === "receita" ? "info" : t.kind === "despesa" ? "warn" : "ok"}>{t.kind === "receita" ? "Receita" : t.kind === "despesa" ? "Despesa" : "Investimento"}</Badge>
                      <span>{formatDateBR(t.occurred_on)}</span>
                      {t.description && <span className="min-w-0 truncate">· {t.description}</span>}
                    </p>
                  </ListRow>
                ))}
              </List>
            )}
            {scope.length > 40 && <p className="mt-2 text-xs text-subtle">Mostrando os 40 mais recentes de {scope.length}. O relatório da safra traz tudo.</p>}
          </Card>
        </>
      )}

      {comparison.length >= 2 && (
        <Card title="Comparação entre safras">
          <GroupedBars
            caption="Receita, despesas e investimentos por safra"
            keys={["receita", "despesa", "investimento"]}
            format={formatMoney}
            groups={comparison.map((r) => ({ label: r.name, values: { receita: r.summary.receita, despesa: r.summary.despesa, investimento: r.summary.investimento } }))}
          />
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <caption className="sr-only">Indicadores por safra</caption>
              <thead>
                <tr className="text-xs text-muted">
                  <th className="py-1.5 pr-3 font-medium">Safra</th>
                  <th className="px-2 py-1.5 text-right font-medium">Margem</th>
                  <th className="px-2 py-1.5 text-right font-medium">Custo/ha</th>
                  <th className="px-2 py-1.5 text-right font-medium">Produtividade</th>
                  <th className="py-1.5 pl-2 text-right font-medium">Custo/saca</th>
                </tr>
              </thead>
              <tbody>
                {comparison.map((r, i) => {
                  const prev = comparison[i - 1];
                  const dCustoHa = prev ? pctChange(r.custoPorHa, prev.custoPorHa) : null;
                  return (
                    <tr key={r.seasonId} className="border-t border-line">
                      <th scope="row" className="py-2 pr-3 font-medium">{r.name}</th>
                      <td className="px-2 py-2 text-right tabular-nums">{formatPercent(r.summary.margemPct)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {r.custoPorHa != null ? formatMoney(r.custoPorHa) : "—"}
                        {dCustoHa != null && <span className={`block text-xs ${dCustoHa > 0 ? "text-danger" : "text-leaf"}`}>{dCustoHa > 0 ? "+" : ""}{formatPercent(dCustoHa)}</span>}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{r.scPorHa != null ? `${formatNum1(r.scPorHa)} sc/ha` : "—"}{r.culturaPrincipal && <span className="block text-xs text-subtle">{r.culturaPrincipal}{r.culturasMistas ? " (principal)" : ""}</span>}</td>
                      <td className="py-2 pl-2 text-right tabular-nums">{r.custoPorSaca != null ? formatMoney(r.custoPorSaca) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-subtle">
            Custo por saca = despesas ÷ sacas de 60 kg colhidas: é o preço mínimo para empatar. Só aparece quando a safra tem uma única cultura colhida (com várias, as despesas são de todas). A produtividade mostrada é a da cultura de maior área. O custo/ha usa a área dos talhões com colheita ou lançamento na safra; a variação é contra a safra anterior da lista.
          </p>
        </Card>
      )}
    </PageShell>
  );
}
