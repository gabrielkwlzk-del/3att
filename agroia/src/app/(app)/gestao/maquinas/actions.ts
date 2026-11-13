"use server";

import { z } from "zod";
import type { ActionState } from "@/lib/farm/action-state";
import { dbMessage, done, fail, requireCtx, text, zDate, zOptMoney, zOptNumber, zOptText, zOptUuid, zUuid, zodFieldErrors } from "@/lib/farm/server";

const PATHS = ["/gestao", "/gestao/maquinas", "/gestao/financeiro"];
const KINDS = ["trator", "colheitadeira", "pulverizador", "plantadeira", "implemento", "caminhao", "outro"] as const;

const MachineSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome da máquina.").max(80),
  kind: z.enum(KINDS, { message: "Escolha o tipo." }),
  brand: zOptText(60),
  model: zOptText(60),
  year: zOptNumber(1950, 2100, "Ano inválido."),
  hour_meter: zOptNumber(0, 1_000_000, "Horímetro inválido."),
  maintenance_interval_hours: zOptNumber(1, 100_000, "Informe um intervalo em horas."),
  notes: zOptText(500),
});

export async function createMachine(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, user } = await requireCtx();
  const parsed = MachineSchema.safeParse({
    name: text(fd, "name"), kind: text(fd, "kind"), brand: text(fd, "brand"), model: text(fd, "model"), year: text(fd, "year"),
    hour_meter: text(fd, "hour_meter"), maintenance_interval_hours: text(fd, "maintenance_interval_hours"), notes: text(fd, "notes"),
  });
  if (!parsed.success) return fail("Revise os campos destacados.", zodFieldErrors(parsed.error));
  const d = parsed.data;
  const hours = d.hour_meter ?? 0;
  const { error } = await supabase.from("machines").insert({
    user_id: user.id, ...d, year: d.year != null ? Math.round(d.year) : null, hour_meter: hours,
    // O ciclo de manutenção começa no horímetro informado
    last_maintenance_hours: hours,
  });
  if (error) return fail(dbMessage(error));
  return done("Máquina cadastrada.", PATHS);
}

const LogSchema = z
  .object({
    machine_id: zUuid,
    kind: z.enum(["uso", "abastecimento", "manutencao"], { message: "Escolha o tipo." }),
    occurred_on: zDate,
    hours: zOptNumber(0.1, 100_000, "Informe as horas trabalhadas."),
    liters: zOptNumber(0.1, 100_000, "Informe os litros."),
    cost_cents: zOptMoney,
    description: zOptText(300),
    field_id: zOptUuid,
    book_expense: z.boolean(),
    season_id: zOptUuid,
  })
  .superRefine((v, ctx) => {
    if (v.kind === "uso" && v.hours == null) ctx.addIssue({ code: "custom", path: ["hours"], message: "Informe as horas trabalhadas." });
    if (v.kind === "abastecimento" && v.liters == null) ctx.addIssue({ code: "custom", path: ["liters"], message: "Informe os litros abastecidos." });
    if (v.kind === "manutencao" && !v.description) ctx.addIssue({ code: "custom", path: ["description"], message: "Descreva a manutenção." });
  });

export async function addMachineLog(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, user } = await requireCtx();
  const parsed = LogSchema.safeParse({
    machine_id: text(fd, "machine_id"), kind: text(fd, "kind"), occurred_on: text(fd, "occurred_on"), hours: text(fd, "hours"),
    liters: text(fd, "liters"), cost_cents: text(fd, "cost_cents"), description: text(fd, "description"), field_id: text(fd, "field_id"),
    book_expense: fd.get("book_expense") === "on", season_id: text(fd, "season_id"),
  });
  if (!parsed.success) return fail("Revise os campos destacados.", zodFieldErrors(parsed.error));
  const v = parsed.data;
  const { data: machine } = await supabase.from("machines").select("name").eq("id", v.machine_id).maybeSingle();
  if (!machine) return fail("Máquina não encontrada.");

  const { error } = await supabase.from("machine_logs").insert({
    user_id: user.id, machine_id: v.machine_id, kind: v.kind, occurred_on: v.occurred_on,
    hours: v.kind === "uso" ? v.hours : null, liters: v.kind === "abastecimento" ? v.liters : null,
    cost_cents: v.kind === "uso" ? null : v.cost_cents, description: v.description, field_id: v.kind === "uso" ? v.field_id : null,
  });
  if (error) return fail(dbMessage(error));

  if (v.book_expense && v.cost_cents && v.kind !== "uso") {
    const { error: txError } = await supabase.from("transactions").insert({
      user_id: user.id, season_id: v.season_id, kind: "despesa", category: v.kind === "abastecimento" ? "Combustível" : "Manutenção de máquinas",
      description: `${machine.name}: ${v.kind === "abastecimento" ? `${v.liters} L` : v.description}`, amount_cents: v.cost_cents, occurred_on: v.occurred_on,
    });
    if (txError) return fail(`Registro salvo, mas a despesa não foi lançada: ${dbMessage(txError)}`);
  }
  return done("Registro salvo.", PATHS);
}

export async function deleteMachine(fd: FormData): Promise<void> {
  const { supabase } = await requireCtx();
  const id = zUuid.safeParse(text(fd, "id"));
  if (!id.success) return;
  const { error } = await supabase.from("machines").delete().eq("id", id.data);
  if (error) throw new Error(dbMessage(error));
  done("", PATHS);
}
