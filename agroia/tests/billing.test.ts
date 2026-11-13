import test from "node:test";
import assert from "node:assert/strict";
import { resolveAccess, checkQuota, anchoredMonthStart, calendarMonthStartBR, daysLeft, type SubscriptionRow } from "../src/lib/billing/access";

const t = test;
const codeOf = (c: ReturnType<typeof checkQuota>) => (c.ok ? "ok" : c.code);
const D = (s: string) => new Date(s);
const now = D("2026-11-13T15:00:00Z");
const base: SubscriptionRow = { plan: "produtor", status: "trialing", billing_interval: null, trial_ends_at: null, current_period_start: null, current_period_end: null, canceled_at: null };

t("teste não iniciado: limites do teste", () => {
  const a = resolveAccess(base, now);
  assert.equal(a.state, "trial_not_started"); assert.equal(a.limits.questions, 15); assert.equal(a.limits.photos, 3);
});
t("teste ativo: janela = 3 dias antes do fim", () => {
  const a = resolveAccess({ ...base, trial_ends_at: "2026-11-15T10:00:00Z" }, now);
  assert.equal(a.state, "trial_active"); assert.equal(a.periodStart.toISOString(), "2026-11-12T10:00:00.000Z"); assert.equal(daysLeft(a.endsAt, now), 2);
});
t("teste vencido → Semente", () => {
  const a = resolveAccess({ ...base, trial_ends_at: "2026-11-13T10:00:00Z" }, now);
  assert.equal(a.state, "trial_ended"); assert.equal(a.plan, "semente"); assert.equal(a.limits.questions, 10);
});
t("ativo (Produtor)", () => {
  const a = resolveAccess({ ...base, status: "active", billing_interval: "month", current_period_start: "2026-11-05T12:00:00Z", current_period_end: "2026-12-05T12:00:00Z" }, now);
  assert.equal(a.state, "paid"); assert.equal(a.limits.questions, 100); assert.equal(a.periodStart.toISOString(), "2026-11-05T12:00:00.000Z");
});
t("anual: limite é mensal ancorado", () => {
  const a = resolveAccess({ ...base, plan: "fazenda", status: "active", billing_interval: "year", current_period_start: "2026-03-20T12:00:00Z", current_period_end: "2027-03-20T12:00:00Z" }, now);
  assert.equal(a.limits.questions, 400); assert.equal(a.periodStart.toISOString(), "2026-11-20T12:00:00.000Z".replace("11-20", "10-20"));
});
t("ativo sem renovação passou da tolerância → Semente", () => {
  const a = resolveAccess({ ...base, status: "active", current_period_start: "2026-09-01T00:00:00Z", current_period_end: "2026-10-01T00:00:00Z" }, now);
  assert.equal(a.state, "free"); assert.equal(a.plan, "semente");
});
t("ativo dentro da tolerância de 3 dias mantém acesso", () => {
  const a = resolveAccess({ ...base, status: "active", current_period_start: "2026-10-12T00:00:00Z", current_period_end: "2026-11-11T00:00:00Z" }, now);
  assert.equal(a.state, "paid");
});
t("atrasado: tolerância e depois Semente", () => {
  const within = resolveAccess({ ...base, status: "past_due", current_period_start: "2026-10-12T00:00:00Z", current_period_end: "2026-11-12T00:00:00Z" }, now);
  assert.equal(within.state, "grace");
  const after = resolveAccess({ ...base, status: "past_due", current_period_start: "2026-10-01T00:00:00Z", current_period_end: "2026-11-01T00:00:00Z" }, now);
  assert.equal(after.state, "free");
});
t("cancelado usa até o fim do período pago", () => {
  const a = resolveAccess({ ...base, status: "canceled", current_period_start: "2026-11-01T00:00:00Z", current_period_end: "2026-12-01T00:00:00Z" }, now);
  assert.equal(a.state, "canceled_active"); assert.equal(a.plan, "produtor");
  const b = resolveAccess({ ...base, status: "canceled", current_period_start: "2026-10-01T00:00:00Z", current_period_end: "2026-11-01T00:00:00Z" }, now);
  assert.equal(b.state, "free");
});
t("expirado/sem assinatura → Semente", () => {
  assert.equal(resolveAccess({ ...base, status: "expired" }, now).plan, "semente");
  assert.equal(resolveAccess(null, now).plan, "semente");
});
t("mês de Brasília: 1º dia 00:00 BRT = 03:00Z", () => {
  assert.equal(calendarMonthStartBR(D("2026-11-13T15:00:00Z")).toISOString(), "2026-11-01T03:00:00.000Z");
  assert.equal(calendarMonthStartBR(D("2026-12-01T01:00:00Z")).toISOString(), "2026-11-01T03:00:00.000Z"); // ainda 30/11 22h em Brasília
});
t("âncora dia 31 não quebra em meses curtos", () => {
  const s = anchoredMonthStart(D("2026-01-31T12:00:00Z"), D("2026-03-01T00:00:00Z"));
  assert.equal(s.toISOString(), "2026-02-28T12:00:00.000Z");
});
t("cota: pergunta esgotada, foto esgotada, fotos insuficientes, ok", () => {
  const a = resolveAccess({ ...base, trial_ends_at: "2026-11-15T10:00:00Z" }, now);
  assert.equal(codeOf(checkQuota(a, { questions: 15, photos: 0 }, 0)), "questions_exhausted");
  assert.equal(codeOf(checkQuota(a, { questions: 3, photos: 3 }, 1)), "photos_exhausted");
  assert.equal(codeOf(checkQuota(a, { questions: 3, photos: 2 }, 2)), "photos_not_enough");
  assert.equal(checkQuota(a, { questions: 14, photos: 2 }, 1).ok, true);
  assert.equal(checkQuota(a, { questions: 3, photos: 3 }, 0).ok, true); // sem foto, ainda pode perguntar
});
