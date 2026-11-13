"use server";

import { z } from "zod";
import type { ActionState } from "@/lib/farm/action-state";
import { dbMessage, done, fail, requireCtx, text, zOptDate, zOptNumber, zOptText, zOptUuid, zUuid, zodFieldErrors } from "@/lib/farm/server";
import { todayBR } from "@/lib/farm/format";

const PATHS = ["/gestao", "/gestao/tarefas", "/gestao/relatorios"];
const KINDS = ["plantio", "aplicacao", "inspecao", "colheita", "irrigacao", "manutencao", "outro"] as const;

const TaskSchema = z.object({
  title: z.string().trim().min(1, "Descreva a tarefa.").max(140, "Máximo de 140 caracteres."),
  kind: z.enum(KINDS, { message: "Escolha o tipo." }),
  field_id: zOptUuid,
  due_on: zOptDate,
  product: zOptText(120),
  dose: zOptText(80),
  target: zOptText(120),
  withdrawal_days: zOptNumber(0, 365, "Informe de 0 a 365 dias."),
  notes: zOptText(1000),
});

export async function createTask(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, user } = await requireCtx();
  const parsed = TaskSchema.safeParse({
    title: text(fd, "title"), kind: text(fd, "kind"), field_id: text(fd, "field_id"), due_on: text(fd, "due_on"),
    product: text(fd, "product"), dose: text(fd, "dose"), target: text(fd, "target"), withdrawal_days: text(fd, "withdrawal_days"), notes: text(fd, "notes"),
  });
  if (!parsed.success) return fail("Revise os campos destacados.", zodFieldErrors(parsed.error));
  const d = parsed.data;
  const alreadyDone = fd.get("already_done") === "on";
  const isApplication = d.kind === "aplicacao";
  const { error } = await supabase.from("tasks").insert({
    user_id: user.id, ...d,
    // Campos de aplicação só valem para aplicações
    product: isApplication ? d.product : null, dose: isApplication ? d.dose : null, target: isApplication ? d.target : null,
    withdrawal_days: isApplication && d.withdrawal_days != null ? Math.round(d.withdrawal_days) : null,
    done: alreadyDone, completed_on: alreadyDone ? (d.due_on ?? todayBR()) : null,
  });
  if (error) return fail(dbMessage(error));
  return done(alreadyDone ? "Registro salvo." : "Tarefa criada.", PATHS);
}

export async function setTaskDone(fd: FormData): Promise<void> {
  const { supabase } = await requireCtx();
  const id = zUuid.safeParse(text(fd, "id"));
  if (!id.success) return;
  const finished = text(fd, "done") === "1";
  const { error } = await supabase.from("tasks").update({ done: finished, completed_on: finished ? todayBR() : null }).eq("id", id.data);
  if (error) throw new Error(dbMessage(error));
  done("", PATHS);
}

export async function deleteTask(fd: FormData): Promise<void> {
  const { supabase } = await requireCtx();
  const id = zUuid.safeParse(text(fd, "id"));
  if (!id.success) return;
  const { error } = await supabase.from("tasks").delete().eq("id", id.data);
  if (error) throw new Error(dbMessage(error));
  done("", PATHS);
}
