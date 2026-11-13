import { diffDays } from "./format";

// ---------- Máquinas ----------
export type MachineState = { hourMeter: number; intervalHours: number | null; lastMaintenanceHours: number };
export type MaintenanceStatus = "sem_plano" | "ok" | "proxima" | "vencida";

export function maintenance(m: MachineState): { status: MaintenanceStatus; remainingHours: number | null; dueAtHours: number | null } {
  if (!m.intervalHours) return { status: "sem_plano", remainingHours: null, dueAtHours: null };
  const dueAt = m.lastMaintenanceHours + m.intervalHours;
  const remaining = dueAt - m.hourMeter;
  const status: MaintenanceStatus = remaining <= 0 ? "vencida" : remaining <= Math.max(10, m.intervalHours * 0.1) ? "proxima" : "ok";
  return { status, remainingHours: remaining, dueAtHours: dueAt };
}

export type MachineLog = { kind: "uso" | "abastecimento" | "manutencao"; hours: number | null; liters: number | null; costCents: number | null };

export function machineStats(logs: MachineLog[]) {
  let hours = 0;
  let liters = 0;
  let fuelCost = 0;
  let maintCost = 0;
  for (const l of logs) {
    if (l.kind === "uso") hours += l.hours ?? 0;
    if (l.kind === "abastecimento") {
      liters += l.liters ?? 0;
      fuelCost += l.costCents ?? 0;
    }
    if (l.kind === "manutencao") maintCost += l.costCents ?? 0;
  }
  return {
    hours,
    liters,
    fuelCost,
    maintCost,
    // Consumo só é confiável com horas de uso registradas junto com o abastecimento
    litersPerHour: hours > 0 && liters > 0 ? liters / hours : null,
    costPerHour: hours > 0 ? Math.round((fuelCost + maintCost) / hours) : null,
  };
}

// ---------- Estoque ----------
export type StockState = "ok" | "baixo" | "vencendo" | "vencido" | "zerado";

export function stockState(item: { quantity: number; minQuantity: number; expiresOn: string | null }, today: string): StockState[] {
  const states: StockState[] = [];
  if (item.expiresOn) {
    const d = diffDays(today, item.expiresOn);
    if (d < 0) states.push("vencido");
    else if (d <= 30) states.push("vencendo");
  }
  if (item.quantity <= 0) states.push("zerado");
  else if (item.minQuantity > 0 && item.quantity <= item.minQuantity) states.push("baixo");
  return states.length ? states : ["ok"];
}

export const stockValueCents = (quantity: number, unitCostCents: number | null) =>
  unitCostCents != null ? Math.round(quantity * unitCostCents) : 0;

// ---------- Tarefas ----------
export type TaskBucket = "atrasada" | "hoje" | "proximas" | "sem_data" | "concluida";

export function taskBucket(t: { done: boolean; dueOn: string | null }, today: string): TaskBucket {
  if (t.done) return "concluida";
  if (!t.dueOn) return "sem_data";
  if (t.dueOn < today) return "atrasada";
  if (t.dueOn === today) return "hoje";
  return "proximas";
}

/** Carência: data a partir da qual a colheita é permitida após uma aplicação (informativo; a bula manda). */
export function withdrawalEnds(appliedOn: string, days: number | null): string | null {
  if (days == null) return null;
  const [y, m, d] = appliedOn.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
