"use server";

import { z } from "zod";
import type { ActionState } from "@/lib/farm/action-state";
import { INVENTORY_CATEGORIES } from "@/lib/farm/categories";
import { dbMessage, done, fail, requireCtx, text, zDate, zNumber, zOptDate, zOptMoney, zOptNumber, zOptText, zOptUuid, zUuid, zodFieldErrors } from "@/lib/farm/server";
import { todayBR } from "@/lib/farm/format";

const PATHS = ["/gestao", "/gestao/estoque", "/gestao/financeiro"];
const UNITS = ["kg", "L", "sc", "t", "un"] as const;
const CATS = INVENTORY_CATEGORIES.map((c) => c.value) as [string, ...string[]];

const ItemSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do insumo.").max(120),
  category: z.enum(CATS, { message: "Escolha a categoria." }),
  unit: z.enum(UNITS, { message: "Escolha a unidade." }),
  quantity: zOptNumber(0, 1_000_000_000, "Quantidade inválida."),
  unit_cost_cents: zOptMoney,
  lot: zOptText(60),
  expires_on: zOptDate,
  min_quantity: zOptNumber(0, 1_000_000_000, "Quantidade inválida."),
  supplier: zOptText(120),
});

export async function createItem(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, user } = await requireCtx();
  const parsed = ItemSchema.safeParse({
    name: text(fd, "name"), category: text(fd, "category"), unit: text(fd, "unit"), quantity: text(fd, "quantity"),
    unit_cost_cents: text(fd, "unit_cost_cents"), lot: text(fd, "lot"), expires_on: text(fd, "expires_on"),
    min_quantity: text(fd, "min_quantity"), supplier: text(fd, "supplier"),
  });
  if (!parsed.success) return fail("Revise os campos destacados.", zodFieldErrors(parsed.error));
  const { quantity, min_quantity, ...rest } = parsed.data;
  const { data: item, error } = await supabase
    .from("inventory_items")
    .insert({ user_id: user.id, ...rest, quantity: 0, min_quantity: min_quantity ?? 0 })
    .select("id")
    .single();
  if (error || !item) return fail(dbMessage(error));
  // Estoque inicial entra como movimentação, para o histórico ficar completo
  if (quantity && quantity > 0) {
    const { error: movError } = await supabase.from("inventory_movements").insert({
      user_id: user.id, item_id: item.id, kind: "entrada", quantity, occurred_on: todayBR(), notes: "Estoque inicial",
    });
    if (movError) return fail(dbMessage(movError));
  }
  return done("Insumo cadastrado.", PATHS);
}

const MovementSchema = z.object({
  item_id: zUuid,
  kind: z.enum(["entrada", "saida", "ajuste"], { message: "Escolha o tipo." }),
  quantity: zNumber(-1_000_000_000, 1_000_000_000, "Informe a quantidade."),
  occurred_on: zDate,
  field_id: zOptUuid,
  unit_cost_cents: zOptMoney,
  notes: zOptText(300),
  book_expense: z.boolean(),
  season_id: zOptUuid,
});

export async function addMovement(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, user } = await requireCtx();
  const parsed = MovementSchema.safeParse({
    item_id: text(fd, "item_id"), kind: text(fd, "kind"), quantity: text(fd, "quantity"), occurred_on: text(fd, "occurred_on"),
    field_id: text(fd, "field_id"), unit_cost_cents: text(fd, "unit_cost_cents"), notes: text(fd, "notes"),
    book_expense: fd.get("book_expense") === "on", season_id: text(fd, "season_id"),
  });
  if (!parsed.success) return fail("Revise os campos destacados.", zodFieldErrors(parsed.error));
  const m = parsed.data;
  if (m.kind !== "ajuste" && m.quantity <= 0) return fail("Revise os campos destacados.", { quantity: "Informe uma quantidade maior que zero." });
  if (m.quantity === 0) return fail("Revise os campos destacados.", { quantity: "A quantidade não pode ser zero." });

  const { data: item } = await supabase.from("inventory_items").select("name, category, unit").eq("id", m.item_id).maybeSingle();
  if (!item) return fail("Insumo não encontrado.");

  const { error } = await supabase.from("inventory_movements").insert({
    user_id: user.id, item_id: m.item_id, kind: m.kind, quantity: m.quantity, field_id: m.kind === "saida" ? m.field_id : null,
    occurred_on: m.occurred_on, notes: m.notes,
  });
  if (error) return fail(dbMessage(error));

  // Entrada com custo: atualiza o último custo unitário e, se pedido, lança a despesa
  if (m.kind === "entrada" && m.unit_cost_cents != null) {
    await supabase.from("inventory_items").update({ unit_cost_cents: m.unit_cost_cents }).eq("id", m.item_id);
    if (m.book_expense) {
      const total = Math.round(m.quantity * m.unit_cost_cents);
      if (total > 0) {
        const txCategory = INVENTORY_CATEGORIES.find((c) => c.value === item.category)?.txCategory ?? "Outros";
        const { error: txError } = await supabase.from("transactions").insert({
          user_id: user.id, season_id: m.season_id, kind: "despesa", category: txCategory,
          description: `Compra: ${item.name} (${m.quantity} ${item.unit})`, amount_cents: total, occurred_on: m.occurred_on,
        });
        if (txError) return fail(`Entrada registrada, mas a despesa não foi lançada: ${dbMessage(txError)}`);
      }
    }
  }
  return done("Movimentação registrada.", PATHS);
}

export async function deleteItem(fd: FormData): Promise<void> {
  const { supabase } = await requireCtx();
  const id = zUuid.safeParse(text(fd, "id"));
  if (!id.success) return;
  const { error } = await supabase.from("inventory_items").delete().eq("id", id.data);
  if (error) throw new Error(dbMessage(error));
  done("", PATHS);
}
