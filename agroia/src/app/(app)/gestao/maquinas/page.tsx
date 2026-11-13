import type { Metadata } from "next";
import { Cog, Trash2 } from "lucide-react";
import { getAuthContext } from "@/lib/supabase/server";
import { loadFields, loadSeasons, optionsOf } from "@/lib/farm/data";
import { machineStats, maintenance, type MachineLog, type MaintenanceStatus } from "@/lib/farm/operations";
import { formatDateBR, formatMoney, formatNum1, formatNum2, todayBR } from "@/lib/farm/format";
import { ActionForm, AddPanel, DateField, FieldGrid, MoneyField, NumberField, RowAction, SelectField, TextField } from "@/components/farm/forms";
import { Badge, EmptyState, List, PageShell } from "@/components/farm/ui";
import { addMachineLog, createMachine, deleteMachine } from "./actions";

export const metadata: Metadata = { title: "Máquinas" };

const KINDS = [
  { value: "trator", label: "Trator" }, { value: "colheitadeira", label: "Colheitadeira" }, { value: "pulverizador", label: "Pulverizador" },
  { value: "plantadeira", label: "Plantadeira" }, { value: "implemento", label: "Implemento" }, { value: "caminhao", label: "Caminhão" }, { value: "outro", label: "Outro" },
];

type MachineRow = { id: string; name: string; kind: string; brand: string | null; model: string | null; year: number | null; hour_meter: number; maintenance_interval_hours: number | null; last_maintenance_hours: number };
type LogRow = { id: string; machine_id: string; kind: MachineLog["kind"]; occurred_on: string; hours: number | null; liters: number | null; cost_cents: number | null; description: string | null };

const MAINT: Record<MaintenanceStatus, { tone: "ok" | "warn" | "danger" | "muted"; label: string }> = {
  ok: { tone: "ok", label: "Manutenção em dia" },
  proxima: { tone: "warn", label: "Manutenção próxima" },
  vencida: { tone: "danger", label: "Manutenção vencida" },
  sem_plano: { tone: "muted", label: "Sem plano de manutenção" },
};

export default async function MachinesPage() {
  const { supabase } = await getAuthContext();
  const today = todayBR();
  const [fields, seasons, machineRes, logRes] = await Promise.all([
    loadFields(supabase),
    loadSeasons(supabase),
    supabase.from("machines").select("id, name, kind, brand, model, year, hour_meter, maintenance_interval_hours, last_maintenance_hours").order("name").limit(200),
    supabase.from("machine_logs").select("id, machine_id, kind, occurred_on, hours, liters, cost_cents, description").order("occurred_on", { ascending: false }).order("created_at", { ascending: false }).limit(1500),
  ]);
  const machines = (machineRes.data ?? []) as MachineRow[];
  const logs = (logRes.data ?? []) as LogRow[];

  return (
    <PageShell title="Máquinas" description="Horas trabalhadas, combustível e manutenção preventiva de tratores, colheitadeiras e implementos.">
      <AddPanel title="Cadastrar máquina" defaultOpen={machines.length === 0}>
        <ActionForm action={createMachine} submitLabel="Cadastrar máquina">
          <FieldGrid>
            <TextField name="name" label="Nome" placeholder="Ex.: Trator 1" required />
            <SelectField name="kind" label="Tipo" required options={KINDS} />
            <TextField name="brand" label="Marca" hint="opcional" />
            <TextField name="model" label="Modelo" hint="opcional" />
            <NumberField name="year" label="Ano" inputMode="numeric" hint="opcional" />
            <NumberField name="hour_meter" label="Horímetro atual (h)" hint="opcional" placeholder="0" />
          </FieldGrid>
          <NumberField name="maintenance_interval_hours" label="Manutenção a cada (horas)" hint="para o alerta preventivo" placeholder="Ex.: 250" />
        </ActionForm>
      </AddPanel>

      {machines.length === 0 ? (
        <EmptyState icon={<Cog className="size-5" aria-hidden />} title="Nenhuma máquina cadastrada" text="Cadastre as máquinas, lance as horas de uso e os abastecimentos e receba o alerta de manutenção preventiva." />
      ) : (
        <List>
          {machines.map((m) => {
            const own = logs.filter((l) => l.machine_id === m.id);
            const stats = machineStats(own.map((l) => ({ kind: l.kind, hours: l.hours != null ? Number(l.hours) : null, liters: l.liters != null ? Number(l.liters) : null, costCents: l.cost_cents != null ? Number(l.cost_cents) : null })));
            const mt = maintenance({ hourMeter: Number(m.hour_meter), intervalHours: m.maintenance_interval_hours ? Number(m.maintenance_interval_hours) : null, lastMaintenanceHours: Number(m.last_maintenance_hours) });
            const interval = m.maintenance_interval_hours ? Number(m.maintenance_interval_hours) : null;
            const used = interval ? Math.min(100, Math.max(0, ((Number(m.hour_meter) - Number(m.last_maintenance_hours)) / interval) * 100)) : 0;
            return (
              <li key={m.id} className="px-4 py-3">
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{m.name}</p>
                      <p className="text-sm text-muted">
                        {KINDS.find((k) => k.value === m.kind)?.label}
                        {m.brand || m.model ? ` · ${[m.brand, m.model].filter(Boolean).join(" ")}` : ""}
                        {m.year ? ` · ${m.year}` : ""}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <Badge tone={MAINT[mt.status].tone}>{MAINT[mt.status].label}</Badge>
                        {mt.remainingHours != null && (
                          <span className="text-xs text-muted">{mt.remainingHours > 0 ? `faltam ${formatNum1(mt.remainingHours)} h` : `${formatNum1(Math.abs(mt.remainingHours))} h além do prazo`}</span>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-lg font-semibold tabular-nums">{formatNum1(Number(m.hour_meter))} <span className="text-sm font-normal text-muted">h</span></p>
                      <p className="text-xs text-subtle">horímetro</p>
                    </div>
                  </summary>

                  <div className="mt-4 space-y-4 border-t border-line pt-4">
                    {interval && (
                      <div aria-label="Ciclo de manutenção">
                        <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                          <div className={`h-full rounded-full ${mt.status === "vencida" ? "bg-danger" : mt.status === "proxima" ? "bg-warning" : "bg-leaf"}`} style={{ width: `${used}%` }} />
                        </div>
                        <p className="mt-1 text-xs text-subtle">Ciclo de {formatNum1(interval)} h · próxima em {mt.dueAtHours != null ? `${formatNum1(mt.dueAtHours)} h` : "—"}</p>
                      </div>
                    )}
                    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="rounded-2xl bg-surface-2/70 p-3"><dt className="text-xs text-muted">Horas lançadas</dt><dd className="font-semibold tabular-nums">{formatNum1(stats.hours)} h</dd></div>
                      <div className="rounded-2xl bg-surface-2/70 p-3"><dt className="text-xs text-muted">Consumo médio</dt><dd className="font-semibold tabular-nums">{stats.litersPerHour != null ? `${formatNum2(stats.litersPerHour)} L/h` : "—"}</dd></div>
                      <div className="rounded-2xl bg-surface-2/70 p-3"><dt className="text-xs text-muted">Combustível</dt><dd className="font-semibold tabular-nums">{formatMoney(stats.fuelCost)}</dd></div>
                      <div className="rounded-2xl bg-surface-2/70 p-3"><dt className="text-xs text-muted">Custo por hora</dt><dd className="font-semibold tabular-nums">{stats.costPerHour != null ? formatMoney(stats.costPerHour) : "—"}</dd></div>
                    </dl>

                    <ActionForm action={addMachineLog} submitLabel="Registrar">
                      <input type="hidden" name="machine_id" value={m.id} />
                      <FieldGrid cols={3}>
                        <SelectField name="kind" label="O que registrar" required defaultValue="uso" options={[{ value: "uso", label: "Horas de uso" }, { value: "abastecimento", label: "Abastecimento" }, { value: "manutencao", label: "Manutenção" }]} />
                        <DateField name="occurred_on" label="Data" required defaultValue={today} />
                        <NumberField name="hours" label="Horas trabalhadas" hint="uso" />
                        <NumberField name="liters" label="Litros" hint="abastecimento" />
                        <MoneyField name="cost_cents" label="Custo" hint="abastecimento/manutenção" />
                        <SelectField name="field_id" label="Talhão (uso)" options={optionsOf(fields)} emptyLabel="Não informar" />
                      </FieldGrid>
                      <TextField name="description" label="Descrição" hint="manutenção: o que foi feito" placeholder="Ex.: troca de óleo e filtros" />
                      <FieldGrid>
                        <SelectField name="season_id" label="Safra da despesa" options={optionsOf(seasons)} emptyLabel="Sem safra" />
                        <label className="flex items-center gap-2.5 self-end pb-3 text-sm">
                          <input type="checkbox" name="book_expense" className="size-5 accent-[var(--brand)]" /> Lançar o custo no financeiro
                        </label>
                      </FieldGrid>
                    </ActionForm>

                    {own.length > 0 && (
                      <div>
                        <p className="mb-1.5 text-xs font-medium text-muted">Últimos registros</p>
                        <ul className="space-y-1 text-sm text-muted">
                          {own.slice(0, 5).map((l) => (
                            <li key={l.id} className="flex justify-between gap-3">
                              <span>{formatDateBR(l.occurred_on)} · {l.kind === "uso" ? "Uso" : l.kind === "abastecimento" ? "Abastecimento" : "Manutenção"}{l.description ? ` · ${l.description}` : ""}</span>
                              <span className="shrink-0 tabular-nums">{l.kind === "uso" ? `${formatNum1(Number(l.hours))} h` : l.kind === "abastecimento" ? `${formatNum1(Number(l.liters))} L` : l.cost_cents ? formatMoney(Number(l.cost_cents)) : ""}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="flex justify-end">
                      <RowAction action={deleteMachine} id={m.id} label="Excluir máquina" icon={<Trash2 className="size-4" />} confirm={`Excluir "${m.name}" e todo o histórico?`} />
                    </div>
                  </div>
                </details>
              </li>
            );
          })}
        </List>
      )}
    </PageShell>
  );
}
