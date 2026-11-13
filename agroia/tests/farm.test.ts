import test from "node:test";
import assert from "node:assert/strict";
import { addDays, diffDays, formatDateBR, formatMoney, formatPercent, isIsoDate, parseDecimalBR, parseMoneyToCents, todayBR } from "../src/lib/farm/format";
import { kgToSacas, toKg } from "../src/lib/farm/units";
import { byCategory, compareSeasons, pctChange, seasonRow, summarize, type Harvest, type Tx } from "../src/lib/farm/finance";
import { effectiveRain, kcFor, waterBalance, type WeatherDay } from "../src/lib/farm/water";
import { applyAdjustment, baseline, tCritical90, weatherStress } from "../src/lib/farm/yield";
import { evaluateAlerts, variation, type Alert, type Quote } from "../src/lib/farm/market";
import { machineStats, maintenance, stockState, stockValueCents, taskBucket, withdrawalEnds } from "../src/lib/farm/operations";
import { parseCsv, toCsv } from "../src/lib/farm/csv";

const near = (a: number | null, b: number, e = 1e-6) => assert.ok(a != null && Math.abs(a - b) <= e, `${a} ≈ ${b}`);

test("números em pt-BR", () => {
  assert.equal(parseDecimalBR("1.234,56"), 1234.56);
  assert.equal(parseDecimalBR("1234,5"), 1234.5);
  assert.equal(parseDecimalBR("1234.56"), 1234.56);
  assert.equal(parseDecimalBR("R$ 12,50"), 12.5);
  assert.equal(parseDecimalBR("1.234"), 1234);
  assert.equal(parseDecimalBR("12.5"), 12.5);
  assert.equal(parseDecimalBR("12.345.678"), 12345678);
  assert.equal(parseDecimalBR("abc"), null);
  assert.equal(parseDecimalBR(""), null);
  assert.equal(parseDecimalBR("1,2,3"), null);
  assert.equal(parseMoneyToCents("39,90"), 3990);
  assert.equal(parseMoneyToCents("0,1"), 10);
  assert.equal(parseMoneyToCents("1.499"), 149900);
});

test("datas sem depender do fuso", () => {
  assert.equal(addDays("2026-02-27", 3), "2026-03-02");
  assert.equal(diffDays("2026-01-01", "2026-03-01"), 59);
  assert.equal(isIsoDate("2026-02-30"), false);
  assert.equal(isIsoDate("2026-02-28"), true);
  assert.equal(formatDateBR("2026-11-05"), "05/11/2026");
  assert.equal(todayBR(new Date("2026-11-13T02:00:00Z")), "2026-11-12"); // 23h em Brasília ainda é dia 12
});

test("sinal de menos que não quebra a linha", () => {
  assert.equal(formatMoney(-3320000).charAt(0), "−");
  assert.ok(formatMoney(-3320000).includes("33.200,00"));
  assert.equal(formatPercent(-63.8).charAt(0), "−");
  assert.equal(formatMoney(1250).includes("-"), false);
});

test("unidades de colheita", () => {
  assert.equal(toKg(10, "sc60"), 600);
  assert.equal(toKg(2, "t"), 2000);
  assert.equal(toKg(4, "arroba"), 60);
  near(kgToSacas(3000), 50);
});

const fields = [{ id: "f1", name: "T1", areaHectares: 50 }, { id: "f2", name: "T2", areaHectares: 30 }];
const seasons = [{ id: "s1", name: "24/25", startDate: "2024-09-01" }, { id: "s2", name: "25/26", startDate: "2025-09-01" }];
const tx = (kind: Tx["kind"], amountCents: number, seasonId: string, fieldId: string | null, category = "x"): Tx => ({ kind, amountCents, seasonId, fieldId, category, occurredOn: "2025-10-01" });
const txs: Tx[] = [
  tx("receita", 1000000, "s1", "f1"), tx("despesa", 600000, "s1", "f1", "Sementes"), tx("despesa", 100000, "s1", "f1", "Combustível"), tx("investimento", 300000, "s1", null),
  tx("receita", 2400000, "s2", "f1"), tx("despesa", 1200000, "s2", "f1", "Sementes"), tx("despesa", 300000, "s2", "f2", "Defensivos"),
];
const harvests: Harvest[] = [
  { seasonId: "s1", fieldId: "f1", amount: 3000, unit: "sc60", crop: "Soja" },
  { seasonId: "s2", fieldId: "f1", amount: 4000, unit: "sc60", crop: "Soja" },
  { seasonId: "s2", fieldId: "f2", amount: 60, unit: "t", crop: "Soja" },
];

test("resumo financeiro: resultado, margem e investimentos", () => {
  const s = summarize(txs.filter((x) => x.seasonId === "s1"));
  assert.equal(s.receita, 1000000);
  assert.equal(s.despesa, 700000);
  assert.equal(s.investimento, 300000);
  assert.equal(s.resultado, 300000);
  near(s.margemPct, 30);
  assert.equal(s.resultadoAposInvestimento, 0);
  assert.equal(summarize([]).margemPct, null);
});

test("despesas por categoria", () => {
  const r = byCategory(txs.filter((x) => x.seasonId === "s1"), "despesa");
  assert.equal(r[0].category, "Sementes");
  near(r[0].pct, (600 / 700) * 100);
});

test("indicadores por safra: custo/ha, produtividade e custo por saca", () => {
  const r1 = seasonRow(seasons[0], txs, harvests, fields);
  assert.equal(r1.areaBasis, "talhoes");
  assert.equal(r1.areaHectares, 50);
  assert.equal(r1.custoPorHa, 14000);
  assert.equal(r1.producaoKg, 180000);
  near(r1.kgPorHa, 3600);
  near(r1.scPorHa, 60);
  assert.equal(r1.custoPorSaca, Math.round(700000 / 3000));
  assert.equal(r1.culturasMistas, false);
  const r2 = seasonRow(seasons[1], txs, harvests, fields);
  assert.equal(r2.areaHectares, 80);
  assert.equal(r2.producaoKg, 240000 + 60000);
  near(r2.kgPorHa, 300000 / 80);
});

test("custo/ha considera talhões com lançamento mesmo sem colheita (regressão: dividia só pela área colhida)", () => {
  const t2 = [tx("despesa", 800000, "s9", "f1"), tx("despesa", 80000, "s9", null)];
  const h2: Harvest[] = [{ seasonId: "s9", fieldId: "f2", amount: 1000, unit: "sc60", crop: "Milho" }];
  const r = seasonRow({ id: "s9", name: "x", startDate: null }, t2, h2, fields);
  assert.equal(r.areaHectares, 80);
  assert.equal(r.custoPorHa, Math.round(880000 / 80));
});

test("culturas diferentes não se misturam (regressão: média de soja com milho)", () => {
  const hs: Harvest[] = [
    { seasonId: "s9", fieldId: "f1", amount: 3000, unit: "sc60", crop: "Soja" }, // 50 ha → 60 sc/ha
    { seasonId: "s9", fieldId: "f2", amount: 6000, unit: "sc60", crop: "Milho" }, // 30 ha → 200 sc/ha
  ];
  const r = seasonRow({ id: "s9", name: "x", startDate: null }, [tx("despesa", 1000000, "s9", "f1")], hs, fields);
  assert.equal(r.culturasMistas, true);
  assert.equal(r.culturaPrincipal, "Soja");
  near(r.scPorHa, 60);
  assert.equal(r.custoPorSaca, null);
  const same = seasonRow({ id: "s9", name: "x", startDate: null }, [tx("despesa", 1000000, "s9", "f1")], [
    { seasonId: "s9", fieldId: "f1", amount: 3000, unit: "sc60", crop: "Soja" },
    { seasonId: "s9", fieldId: "f2", amount: 1800, unit: "sc60", crop: "soja" },
  ], fields);
  assert.equal(same.culturasMistas, false);
  near(same.scPorHa, 4800 / 80);
  assert.ok((same.custoPorSaca ?? 0) > 0);
});

test("safra sem colheita usa a área dos lançamentos; sem nada, todos os talhões; sem talhões, nulo", () => {
  const only = seasonRow(seasons[0], txs, [], fields);
  assert.equal(only.areaHectares, 50);
  assert.equal(only.kgPorHa, null);
  assert.equal(only.custoPorSaca, null);
  const none = seasonRow({ id: "s9", name: "vazia", startDate: null }, [], [], fields);
  assert.equal(none.areaBasis, "todos");
  assert.equal(none.areaHectares, 80);
  const nofields = seasonRow({ id: "s9", name: "v", startDate: null }, [], [], []);
  assert.equal(nofields.areaHectares, null);
  assert.equal(nofields.custoPorHa, null);
});

test("comparação entre safras: ordem por início e variação %", () => {
  const rows = compareSeasons([seasons[1], seasons[0]], txs, harvests, fields);
  assert.deepEqual(rows.map((r) => r.name), ["24/25", "25/26"]);
  near(pctChange(rows[1].summary.receita, rows[0].summary.receita), 140);
  assert.equal(pctChange(5, 0), null);
});

test("Kc por cultura e estágio", () => {
  assert.equal(kcFor("Soja", "medio")?.kc, 1.15);
  assert.equal(kcFor("Milho", "inicial")?.kc, 0.3);
  near(kcFor("Soja", "desenvolvimento")?.kc ?? null, 0.775);
  assert.equal(kcFor("Feijão", "final")?.kc, 0.35);
  assert.equal(kcFor("Pastagem", "medio")?.cropLabel, "Pastagem");
  assert.equal(kcFor("Hortaliças", "medio")?.generic, true);
  assert.equal(kcFor("Unicórnio", "medio"), null);
  assert.equal(kcFor("Soja", null), null);
});

const day = (date: string, et0: number | null, rain: number | null): WeatherDay => ({ date, et0, rain });

test("chuva efetiva", () => {
  assert.equal(effectiveRain(4.9), 0);
  near(effectiveRain(10), 8);
});

test("balanço hídrico: seca leva a 'irrigar' e sugere repor o déficit", () => {
  const obs = ["01", "02", "03", "04", "05", "06", "07"].map((d) => day(`2026-11-${d}`, 6, 0));
  const r = waterBalance({ observed: obs, forecast: [], irrigation: [], kc: 1, awcMm: 60 });
  near(r.depletionMm, 42);
  assert.equal(r.thresholdMm, 30);
  assert.equal(r.status, "irrigar");
  assert.equal(r.suggestedMm, 42);
});

test("balanço hídrico: chuva e irrigação repõem; nunca passa da capacidade nem fica negativo", () => {
  const rain = waterBalance({ observed: [day("2026-11-01", 5, 0), day("2026-11-02", 5, 0), day("2026-11-03", 5, 40)], forecast: [], irrigation: [], kc: 1, awcMm: 60 });
  assert.equal(rain.depletionMm, 0);
  assert.equal(rain.status, "ok");
  const dry = waterBalance({ observed: Array.from({ length: 30 }, (_, i) => day(`2026-10-${String(i + 1).padStart(2, "0")}`, 8, 0)), forecast: [], irrigation: [], kc: 1.2, awcMm: 50 });
  assert.equal(dry.depletionMm, 50);
  const irr = waterBalance({ observed: [day("2026-11-01", 6, 0), day("2026-11-02", 6, 0), day("2026-11-03", 6, 0)], forecast: [], irrigation: [{ date: "2026-11-03", mm: 10 }], kc: 1, awcMm: 60 });
  near(irr.depletionMm, 8);
});

test("balanço hídrico: projeção até o limite e dias sem dado", () => {
  const fc = [day("2026-11-02", 5, 0), day("2026-11-03", 5, 0), day("2026-11-04", null, null), day("2026-11-05", 5, 0)];
  const r = waterBalance({ observed: [day("2026-11-01", 5, 0)], forecast: fc, irrigation: [], kc: 1, awcMm: 20 });
  assert.equal(r.status, "ok");
  assert.equal(r.daysUntilThreshold, 1);
  assert.equal(r.missingDays, 1);
});

test("previsão: com 1 safra não há intervalo", () => {
  const b = baseline([3000]);
  assert.equal(b.n, 1);
  assert.equal(b.low, null);
  assert.equal(baseline([]).mean, null);
});

test("previsão: intervalo de predição t de Student (n = 5)", () => {
  const b = baseline([3000, 3200, 3400, 3600, 3800]);
  near(b.mean, 3400);
  near(b.sd, Math.sqrt(100000));
  const half = 1.533 * (b.sd as number) * Math.sqrt(1.2);
  near(b.low, 3400 - half, 0.01);
  near(b.high, 3400 + half, 0.01);
  assert.ok((b.low as number) < (b.min as number) && (b.high as number) > (b.max as number));
});

test("previsão: poucas safras dão faixa mais larga", () => {
  const two = baseline([3000, 3600]);
  const five = baseline([3000, 3200, 3400, 3600, 3800]);
  assert.ok((two.high as number) - (two.low as number) > (five.high as number) - (five.low as number));
  near(tCritical90(4), 1.533);
  near(tCritical90(200), 1.282);
  near(tCritical90(12), 1.372);
});

test("ajuste da IA é limitado e alarga a faixa", () => {
  const b = baseline([3000, 3200, 3400, 3600, 3800]);
  const a = applyAdjustment(b, -80)!;
  assert.equal(a.adjustmentPct, -30);
  near(a.mid, 3400 * 0.7);
  assert.ok(a.high - a.low > ((b.high as number) - (b.low as number)) * 0.7);
  const none = applyAdjustment(b, 0)!;
  near(none.low, b.low as number);
  assert.equal(applyAdjustment(b, 50)!.adjustmentPct, 15);
  assert.equal(applyAdjustment(baseline([3000]), 5), null);
});

test("indicadores de clima do ciclo", () => {
  const s = weatherStress([
    { date: "d1", et0: 5, rain: 0, tmax: 35 }, { date: "d2", et0: 5, rain: 0.5, tmax: 36 }, { date: "d3", et0: 5, rain: 0, tmax: 30 },
    { date: "d4", et0: 4, rain: 20, tmax: 28 }, { date: "d5", et0: null, rain: null, tmax: null }, { date: "d6", et0: 4, rain: 0, tmax: 33 },
  ]);
  assert.equal(s.hotDays, 2);
  assert.equal(s.longestDrySpell, 3);
  assert.equal(s.missingDays, 1);
  near(s.rainTotalMm, 20.5);
  near(s.et0TotalMm, 23);
  near(s.rainToEt0, 20.5 / 23);
});

const q = (commodity: string, price: number, quotedOn: string, unit = "sc"): Quote => ({ commodity, price, unit, quotedOn, source: "CEPEA" });

test("variação de cotações respeita a unidade", () => {
  const series = [q("soja", 100, "2026-10-01"), q("soja", 110, "2026-10-25"), q("soja", 120, "2026-11-04"), q("soja", 126, "2026-11-05")];
  const v = variation(series)!;
  assert.equal(v.last.price, 126);
  near(v.vsPreviousPct, 5);
  near(v.vs7dPct, ((126 - 110) / 110) * 100);
});

test("alertas de preço: acima, abaixo e variação", () => {
  const quotes = [q("soja", 100, "2026-11-01"), q("soja", 108, "2026-11-02"), q("milho", 50, "2026-11-02")];
  const alerts: Alert[] = [
    { id: "a1", commodity: "soja", kind: "acima", threshold: 105, active: true }, { id: "a2", commodity: "soja", kind: "abaixo", threshold: 90, active: true },
    { id: "a3", commodity: "soja", kind: "variacao", threshold: 5, active: true }, { id: "a4", commodity: "milho", kind: "acima", threshold: 60, active: true },
    { id: "a5", commodity: "soja", kind: "acima", threshold: 1, active: false }, { id: "a6", commodity: "trigo", kind: "acima", threshold: 1, active: true },
  ];
  assert.deepEqual(evaluateAlerts(alerts, quotes).map((o) => o.alertId), ["a1", "a3"]);
});

test("manutenção de máquinas", () => {
  assert.equal(maintenance({ hourMeter: 1000, intervalHours: null, lastMaintenanceHours: 0 }).status, "sem_plano");
  assert.equal(maintenance({ hourMeter: 1000, intervalHours: 250, lastMaintenanceHours: 900 }).status, "ok");
  const next = maintenance({ hourMeter: 1130, intervalHours: 250, lastMaintenanceHours: 900 });
  assert.equal(next.status, "proxima");
  assert.equal(next.remainingHours, 20);
  assert.equal(maintenance({ hourMeter: 1151, intervalHours: 250, lastMaintenanceHours: 900 }).status, "vencida");
});

test("estatística de máquinas", () => {
  const s = machineStats([
    { kind: "uso", hours: 10, liters: null, costCents: null }, { kind: "uso", hours: 10, liters: null, costCents: null },
    { kind: "abastecimento", hours: null, liters: 100, costCents: 60000 }, { kind: "manutencao", hours: null, liters: null, costCents: 40000 },
  ]);
  assert.equal(s.hours, 20);
  assert.equal(s.litersPerHour, 5);
  assert.equal(s.costPerHour, 5000);
  assert.equal(machineStats([{ kind: "abastecimento", hours: null, liters: 100, costCents: 1 }]).litersPerHour, null);
});

test("estado do estoque e valor", () => {
  const today = "2026-11-13";
  assert.deepEqual(stockState({ quantity: 10, minQuantity: 0, expiresOn: null }, today), ["ok"]);
  assert.deepEqual(stockState({ quantity: 5, minQuantity: 5, expiresOn: null }, today), ["baixo"]);
  assert.deepEqual(stockState({ quantity: 0, minQuantity: 5, expiresOn: "2026-11-01" }, today), ["vencido", "zerado"]);
  assert.deepEqual(stockState({ quantity: 9, minQuantity: 0, expiresOn: "2026-12-13" }, today), ["vencendo"]);
  assert.deepEqual(stockState({ quantity: 9, minQuantity: 0, expiresOn: "2026-12-14" }, today), ["ok"]);
  assert.equal(stockValueCents(2.5, 1000), 2500);
  assert.equal(stockValueCents(2, null), 0);
});

test("tarefas e carência", () => {
  const today = "2026-11-13";
  assert.equal(taskBucket({ done: true, dueOn: "2026-01-01" }, today), "concluida");
  assert.equal(taskBucket({ done: false, dueOn: "2026-11-12" }, today), "atrasada");
  assert.equal(taskBucket({ done: false, dueOn: today }, today), "hoje");
  assert.equal(taskBucket({ done: false, dueOn: "2026-11-14" }, today), "proximas");
  assert.equal(taskBucket({ done: false, dueOn: null }, today), "sem_data");
  assert.equal(withdrawalEnds("2026-11-25", 14), "2026-12-09");
  assert.equal(withdrawalEnds("2026-11-25", null), null);
});

test("CSV: escape, proteção contra fórmulas e leitura", () => {
  const out = toCsv([["a;b", 'x"y', 12.5, null, "=2+2", "-5"], ["ok"]]);
  assert.ok(out.startsWith("﻿"));
  assert.ok(out.includes('"a;b"'));
  assert.ok(out.includes('"x""y"'));
  assert.ok(out.includes("12,5"));
  assert.ok(out.includes("'=2+2"));
  assert.ok(out.includes("'-5"));
  assert.deepEqual(parseCsv('data;preco\r\n2026-11-01;130,5\r\n2026-11-02;"131,2"\r\n'), [["data", "preco"], ["2026-11-01", "130,5"], ["2026-11-02", "131,2"]]);
  assert.deepEqual(parseCsv("a,b\n1,2\n"), [["a", "b"], ["1", "2"]]);
  assert.deepEqual(parseCsv("a\tb\n1\t2"), [["a", "b"], ["1", "2"]]);
});
