"use server";

import { z } from "zod";
import type { ActionState } from "@/lib/farm/action-state";
import { dbMessage, done, fail, requireCtx, text, zDate, zMoney, zOptText, zOptUuid, zUuid, zodFieldErrors } from "@/lib/farm/server";

const PATHS = ["/gestao", "/gestao/financeiro", "/gestao/relatorios"];

const TxSchema = z.object({
  kind: z.enum(["despesa", "receita", "investimento"], { message: "Escolha o tipo." }),
  category: z.string().trim().min(1, "Informe a categoria.").max(60, "Máximo de 60 caracteres."),
  amount_cents: zMoney,
  occurred_on: zDate,
  season_id: zOptUuid,
  field_id: zOptUuid,
  description: zOptText(200),
});

export async function createTransaction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, user } = await requireCtx();
  const parsed = TxSchema.safeParse({
    kind: text(fd, "kind"),
    category: text(fd, "category"),
    amount_cents: text(fd, "amount_cents"),
    occurred_on: text(fd, "occurred_on"),
    season_id: text(fd, "season_id"),
    field_id: text(fd, "field_id"),
    description: text(fd, "description"),
  });
  if (!parsed.success) return fail("Revise os campos destacados.", zodFieldErrors(parsed.error));
  const { error } = await supabase.from("transactions").insert({ user_id: user.id, ...parsed.data });
  if (error) return fail(dbMessage(error));
  return done("Lançamento salvo.", PATHS);
}

export async function deleteTransaction(fd: FormData): Promise<void> {
  const { supabase } = await requireCtx();
  const id = zUuid.safeParse(text(fd, "id"));
  if (!id.success) return;
  const { error } = await supabase.from("transactions").delete().eq("id", id.data);
  if (error) throw new Error(dbMessage(error));
  done("", PATHS);
}
