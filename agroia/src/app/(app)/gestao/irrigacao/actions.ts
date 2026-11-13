"use server";

import { z } from "zod";
import type { ActionState } from "@/lib/farm/action-state";
import { dbMessage, done, fail, requireCtx, text, zDate, zNumber, zOptNumber, zOptText, zUuid, zodFieldErrors } from "@/lib/farm/server";

const PATHS = ["/gestao", "/gestao/irrigacao", "/gestao/relatorios"];

const IrrigationSchema = z.object({
  field_id: zUuid,
  occurred_on: zDate,
  amount_mm: zNumber(0.1, 500, "Informe a lâmina em mm (ex.: 12)."),
  method: z.preprocess((v) => (v === "" || v == null ? null : v), z.enum(["pivo", "aspersao", "gotejamento", "sulcos", "outro"]).nullable()),
  duration_hours: zOptNumber(0.1, 240, "Duração inválida."),
  notes: zOptText(300),
});

export async function createIrrigation(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, user } = await requireCtx();
  const parsed = IrrigationSchema.safeParse({
    field_id: text(fd, "field_id"), occurred_on: text(fd, "occurred_on"), amount_mm: text(fd, "amount_mm"),
    method: text(fd, "method"), duration_hours: text(fd, "duration_hours"), notes: text(fd, "notes"),
  });
  if (!parsed.success) return fail("Revise os campos destacados.", zodFieldErrors(parsed.error));
  const { error } = await supabase.from("irrigation_logs").insert({ user_id: user.id, ...parsed.data });
  if (error) return fail(dbMessage(error));
  return done("Irrigação registrada.", PATHS);
}

export async function deleteIrrigation(fd: FormData): Promise<void> {
  const { supabase } = await requireCtx();
  const id = zUuid.safeParse(text(fd, "id"));
  if (!id.success) return;
  const { error } = await supabase.from("irrigation_logs").delete().eq("id", id.data);
  if (error) throw new Error(dbMessage(error));
  done("", PATHS);
}
