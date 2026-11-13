import type { Metadata } from "next";
import { Package, Trash2 } from "lucide-react";
import { getAuthContext } from "@/lib/supabase/server";
import { loadFields, loadSeasons, optionsOf } from "@/lib/farm/data";
import { INVENTORY_CATEGORIES } from "@/lib/farm/categories";
import { stockState, stockValueCents, type StockState } from "@/lib/farm/operations";
import { formatDateBR, formatMoney, formatNum3, todayBR } from "@/lib/farm/format";
import { ActionForm, AddPanel, DateField, FieldGrid, MoneyField, NumberField, RowAction, SelectField, TextField } from "@/components/farm/forms";
import { Badge, Card, EmptyState, List, PageShell, Stat } from "@/components/farm/ui";
import { addMovement, createItem, deleteItem } from "./actions";

export const metadata: Metadata = { title: "Estoque de insumos" };

type ItemRow = { id: string; name: string; category: string; unit: string; quantity: number; unit_cost_cents: number | null; lot: string | null; expires_on: string | null; min_quantity: number; supplier: string | null };
type MovRow = { item_id: string; kind: "entrada" | "saida" | "ajuste"; quantity: number; occurred_on: string; notes: string | null };

const STATE_BADGE: Record<StockState, { tone: "ok" | "warn" | "danger"; label: string }> = {
  ok: { tone: "ok", label: "Em estoque" },
  baixo: { tone: "warn", label: "Estoque baixo" },
  zerado: { tone: "danger", label: "Zerado" },
  vencendo: { tone: "warn", label: "Vence em até 30 dias" },
  vencido: { tone: "danger", label: "Vencido" },
};

export default async function InventoryPage() {
  const { supabase } = await getAuthContext();
  const today = todayBR();
  const [fields, seasons, itemRes, movRes] = await Promise.all([
    loadFields(supabase),
    loadSeasons(supabase),
    supabase.from("inventory_items").select("id, name, category, unit, quantity, unit_cost_cents, lot, expires_on, min_quantity, supplier").order("name").limit(1000),
    supabase.from("inventory_movements").select("item_id, kind, quantity, occurred_on, notes").order("occurred_on", { ascending: false }).order("created_at", { ascending: false }).limit(600),
  ]);
  const items = (itemRes.data ?? []) as ItemRow[];
  const movements = (movRes.data ?? []) as MovRow[];
  const movByItem = new Map<string, MovRow[]>();
  for (const m of movements) movByItem.set(m.item_id, [...(movByItem.get(m.item_id) ?? []), m]);

  const totalValue = items.reduce((s, i) => s + stockValueCents(Number(i.quantity), i.unit_cost_cents != null ? Number(i.unit_cost_cents) : null), 0);
  const flagged = items.filter((i) => !stockState({ quantity: Number(i.quantity), minQuantity: Number(i.min_quantity), expiresOn: i.expires_on }, today).includes("ok")).length;
  const catLabel = (v: string) => INVENTORY_CATEGORIES.find((c) => c.value === v)?.label ?? v;

  return (
    <PageShell title="Estoque de insumos" description="Sementes, fertilizantes, defensivos e outros, com lote, validade, mínimo e custo.">
      {items.length > 0 && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Resumo">
          <div className="col-span-2 sm:order-2 sm:col-span-1"><Stat label="Valor em estoque" value={formatMoney(totalValue)} hint="quantidade × último custo" /></div>
          <div className="sm:order-1"><Stat label="Itens" value={String(items.length)} /></div>
          <div className="sm:order-3"><Stat label="Com alerta" value={String(flagged)} tone={flagged ? "bad" : "default"} hint="baixo, zerado ou validade" /></div>
        </section>
      )}

      <AddPanel title="Cadastrar insumo" defaultOpen={items.length === 0}>
        <ActionForm action={createItem} submitLabel="Cadastrar insumo">
          <FieldGrid>
            <TextField name="name" label="Nome" placeholder="Ex.: Semente de soja X" required />
            <SelectField name="category" label="Categoria" required options={INVENTORY_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))} />
            <SelectField name="unit" label="Unidade" required defaultValue="kg" options={[{ value: "kg", label: "Quilo (kg)" }, { value: "L", label: "Litro (L)" }, { value: "sc", label: "Saca (sc)" }, { value: "t", label: "Tonelada (t)" }, { value: "un", label: "Unidade" }]} />
            <NumberField name="quantity" label="Quantidade em estoque" hint="opcional" placeholder="0" />
            <MoneyField name="unit_cost_cents" label="Custo por unidade" hint="opcional" />
            <NumberField name="min_quantity" label="Estoque mínimo" hint="para o alerta" placeholder="0" />
            <TextField name="lot" label="Lote" hint="opcional" />
            <DateField name="expires_on" label="Validade" />
          </FieldGrid>
          <TextField name="supplier" label="Fornecedor" hint="opcional" />
        </ActionForm>
      </AddPanel>

      {items.length === 0 ? (
        <EmptyState icon={<Package className="size-5" aria-hidden />} title="Nenhum insumo cadastrado" text="Cadastre os insumos para acompanhar quantidades, validade e custo, e registrar as saídas por talhão." />
      ) : (
        <List>
          {items.map((i) => {
            const states = stockState({ quantity: Number(i.quantity), minQuantity: Number(i.min_quantity), expiresOn: i.expires_on }, today);
            const history = (movByItem.get(i.id) ?? []).slice(0, 4);
            return (
              <li key={i.id} className="px-4 py-3">
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{i.name}</p>
                      <p className="text-sm text-muted">
                        {catLabel(i.category)}
                        {i.lot ? ` · lote ${i.lot}` : ""}
                        {i.expires_on ? ` · validade ${formatDateBR(i.expires_on)}` : ""}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {states.map((s) => (
                          <Badge key={s} tone={STATE_BADGE[s].tone}>{STATE_BADGE[s].label}</Badge>
                        ))}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-lg font-semibold tabular-nums">
                        {formatNum3(Number(i.quantity))} <span className="text-sm font-normal text-muted">{i.unit}</span>
                      </p>
                      {i.unit_cost_cents != null && <p className="text-xs text-subtle">{formatMoney(stockValueCents(Number(i.quantity), Number(i.unit_cost_cents)))}</p>}
                    </div>
                  </summary>
                  <div className="mt-4 space-y-4 border-t border-line pt-4">
                    <ActionForm action={addMovement} submitLabel="Registrar movimentação">
                      <input type="hidden" name="item_id" value={i.id} />
                      <FieldGrid cols={3}>
                        <SelectField name="kind" label="Movimentação" required defaultValue="saida" options={[{ value: "entrada", label: "Entrada (compra)" }, { value: "saida", label: "Saída (uso)" }, { value: "ajuste", label: "Ajuste de inventário (+/−)" }]} />
                        <NumberField name="quantity" label={`Quantidade (${i.unit})`} required />
                        <DateField name="occurred_on" label="Data" required defaultValue={today} />
                        <SelectField name="field_id" label="Talhão (saída)" options={optionsOf(fields)} emptyLabel="Não informar" />
                        <MoneyField name="unit_cost_cents" label="Custo por unidade (entrada)" hint="opcional" />
                        <SelectField name="season_id" label="Safra da despesa" options={optionsOf(seasons)} emptyLabel="Sem safra" />
                      </FieldGrid>
                      <label className="flex items-center gap-2.5 text-sm">
                        <input type="checkbox" name="book_expense" className="size-5 accent-[var(--brand)]" /> Lançar a compra como despesa no financeiro (entrada com custo)
                      </label>
                      <TextField name="notes" label="Observação" hint="opcional" />
                    </ActionForm>
                    {history.length > 0 && (
                      <div>
                        <p className="mb-1.5 text-xs font-medium text-muted">Últimas movimentações</p>
                        <ul className="space-y-1 text-sm text-muted">
                          {history.map((m, idx) => (
                            <li key={idx} className="flex justify-between gap-3">
                              <span>{formatDateBR(m.occurred_on)} · {m.kind === "entrada" ? "Entrada" : m.kind === "saida" ? "Saída" : "Ajuste"}{m.notes ? ` · ${m.notes}` : ""}</span>
                              <span className="tabular-nums">{m.kind === "saida" ? "−" : m.kind === "entrada" ? "+" : Number(m.quantity) > 0 ? "+" : ""}{formatNum3(Number(m.quantity))} {i.unit}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="flex justify-end">
                      <RowAction action={deleteItem} id={i.id} label="Excluir insumo" icon={<Trash2 className="size-4" />} confirm={`Excluir "${i.name}" e todo o histórico de movimentações?`} />
                    </div>
                  </div>
                </details>
              </li>
            );
          })}
        </List>
      )}
      <Card>
        <p className="text-sm text-muted">
          O alerta de validade avisa 30 dias antes. Saídas maiores que o estoque são recusadas. O custo por unidade informado numa entrada passa a ser o custo usado para valorar o estoque.
        </p>
      </Card>
    </PageShell>
  );
}
