import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, formatMoney, todayBR } from "./format";
import { summarize, type Tx } from "./finance";
import { evaluateAlerts, type Alert, type Quote } from "./market";
import { maintenance, stockState, taskBucket } from "./operations";

export type HubLine = { text: string; tone?: "warn" | "danger" | "ok" };
export type Attention = { href: string; text: string; tone: "warn" | "danger" | "info" };

export type HubData = {
  lines: Record<string, HubLine>;
  attention: Attention[];
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export async function loadHub(supabase: SupabaseClient): Promise<HubData> {
  const today = todayBR();
  const since = addDays(today, -90);

  const [fields, seasons, tasks, items, machines, quotes, alerts, soil] = await Promise.all([
    supabase.from("fields").select("id, area_hectares"),
    supabase.from("seasons").select("id, name, start_date").order("start_date", { ascending: false, nullsFirst: false }).limit(1),
    supabase.from("tasks").select("due_on, done").eq("done", false).limit(500),
    supabase.from("inventory_items").select("quantity, min_quantity, expires_on").limit(1000),
    supabase.from("machines").select("hour_meter, maintenance_interval_hours, last_maintenance_hours").limit(200),
    supabase.from("market_quotes").select("commodity, price, unit, quoted_on, source").gte("quoted_on", since).order("quoted_on", { ascending: true }).limit(2000),
    supabase.from("market_alerts").select("id, commodity, kind, threshold, active").eq("active", true).limit(100),
    supabase.from("soil_reports").select("id", { count: "exact", head: true }),
  ]);

  const lines: Record<string, HubLine> = {};
  const attention: Attention[] = [];

  // Talhões e safras
  const fieldRows = (fields.data ?? []) as { id: string; area_hectares: number }[];
  const totalArea = fieldRows.reduce((s, f) => s + Number(f.area_hectares), 0);
  const season = (seasons.data ?? [])[0] as { id: string; name: string } | undefined;
  lines.talhoes = fieldRows.length
    ? { text: `${plural(fieldRows.length, "talhão", "talhões")} · ${totalArea.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ha${season ? ` · ${season.name}` : ""}` }
    : { text: "Cadastre seus talhões para começar", tone: "warn" };

  // Financeiro da safra mais recente
  if (season) {
    const { data } = await supabase.from("transactions").select("kind, amount_cents").eq("season_id", season.id).limit(5000);
    const txs = ((data ?? []) as { kind: Tx["kind"]; amount_cents: number }[]).map((t) => ({ kind: t.kind, amountCents: Number(t.amount_cents), seasonId: season.id, fieldId: null, category: "", occurredOn: "" }));
    if (txs.length) {
      const s = summarize(txs);
      lines.financeiro = { text: `${season.name}: resultado ${formatMoney(s.resultado)}`, tone: s.resultado < 0 ? "danger" : "ok" };
    } else lines.financeiro = { text: `Sem lançamentos em ${season.name}` };
  } else lines.financeiro = { text: "Crie uma safra para lançar custos e receitas" };

  // Tarefas
  const taskRows = (tasks.data ?? []) as { due_on: string | null; done: boolean }[];
  const overdue = taskRows.filter((t) => taskBucket({ done: false, dueOn: t.due_on }, today) === "atrasada").length;
  const dueToday = taskRows.filter((t) => taskBucket({ done: false, dueOn: t.due_on }, today) === "hoje").length;
  lines.tarefas = taskRows.length
    ? { text: `${plural(taskRows.length, "pendente", "pendentes")}${overdue ? ` · ${overdue} atrasada(s)` : ""}`, tone: overdue ? "danger" : dueToday ? "warn" : undefined }
    : { text: "Nenhuma tarefa pendente" };
  if (overdue) attention.push({ href: "/gestao/tarefas", text: `${plural(overdue, "tarefa atrasada", "tarefas atrasadas")}`, tone: "danger" });
  if (dueToday) attention.push({ href: "/gestao/tarefas", text: `${plural(dueToday, "tarefa para hoje", "tarefas para hoje")}`, tone: "warn" });

  // Estoque
  const itemRows = (items.data ?? []) as { quantity: number; min_quantity: number; expires_on: string | null }[];
  let low = 0;
  let expiring = 0;
  for (const i of itemRows) {
    const st = stockState({ quantity: Number(i.quantity), minQuantity: Number(i.min_quantity), expiresOn: i.expires_on }, today);
    if (st.includes("baixo") || st.includes("zerado")) low += 1;
    if (st.includes("vencendo") || st.includes("vencido")) expiring += 1;
  }
  lines.estoque = itemRows.length
    ? { text: `${plural(itemRows.length, "item", "itens")}${low ? ` · ${low} com estoque baixo` : ""}${expiring ? ` · ${expiring} vencendo` : ""}`, tone: low || expiring ? "warn" : undefined }
    : { text: "Nenhum insumo cadastrado" };
  if (low) attention.push({ href: "/gestao/estoque", text: `${plural(low, "insumo com estoque baixo", "insumos com estoque baixo")}`, tone: "warn" });
  if (expiring) attention.push({ href: "/gestao/estoque", text: `${plural(expiring, "lote vencido ou vencendo em 30 dias", "lotes vencidos ou vencendo em 30 dias")}`, tone: "warn" });

  // Máquinas
  const machineRows = (machines.data ?? []) as { hour_meter: number; maintenance_interval_hours: number | null; last_maintenance_hours: number }[];
  let overdueMachines = 0;
  for (const m of machineRows) {
    if (maintenance({ hourMeter: Number(m.hour_meter), intervalHours: m.maintenance_interval_hours ? Number(m.maintenance_interval_hours) : null, lastMaintenanceHours: Number(m.last_maintenance_hours) }).status === "vencida") overdueMachines += 1;
  }
  lines.maquinas = machineRows.length
    ? { text: `${plural(machineRows.length, "máquina", "máquinas")}${overdueMachines ? ` · ${overdueMachines} com manutenção vencida` : ""}`, tone: overdueMachines ? "danger" : undefined }
    : { text: "Nenhuma máquina cadastrada" };
  if (overdueMachines) attention.push({ href: "/gestao/maquinas", text: `${plural(overdueMachines, "máquina com manutenção vencida", "máquinas com manutenção vencida")}`, tone: "danger" });

  // Mercado
  const quoteRows: Quote[] = ((quotes.data ?? []) as { commodity: string; price: number; unit: string; quoted_on: string; source: string }[]).map((q) => ({
    commodity: q.commodity, price: Number(q.price), unit: q.unit, quotedOn: q.quoted_on, source: q.source,
  }));
  const triggered = evaluateAlerts(((alerts.data ?? []) as { id: string; commodity: string; kind: Alert["kind"]; threshold: number; active: boolean }[]).map((a) => ({ ...a, threshold: Number(a.threshold) })), quoteRows);
  lines.mercado = quoteRows.length
    ? { text: `${new Set(quoteRows.map((q) => q.commodity)).size} mercadorias acompanhadas${triggered.length ? ` · ${triggered.length} alerta(s)` : ""}`, tone: triggered.length ? "warn" : undefined }
    : { text: "Lance cotações para acompanhar preços" };
  for (const t of triggered.slice(0, 3)) attention.push({ href: "/gestao/mercado", text: t.message, tone: "info" });

  // Outros módulos
  lines.irrigacao = { text: "Necessidade de água por talhão" };
  lines.solo = { text: soil.count ? `${plural(soil.count, "laudo analisado", "laudos analisados")}` : "Envie o PDF do laudo para interpretar" };
  lines.produtividade = { text: "Estimativa com base no seu histórico" };
  lines.relatorios = { text: "Resumo da safra, CSV e PDF" };

  return { lines, attention };
}
