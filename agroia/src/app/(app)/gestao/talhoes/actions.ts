"use server";

import { z } from "zod";
import type { ActionState } from "@/lib/farm/action-state";
import { dbMessage, done, fail, requireCtx, text, zNumber, zOptDate, zOptNumber, zOptText, zUuid, zodFieldErrors } from "@/lib/farm/server";

const PATHS = ["/gestao", "/gestao/talhoes", "/gestao/financeiro", "/gestao/irrigacao", "/gestao/produtividade"];

const FieldSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do talhão.").max(80, "Máximo de 80 caracteres."),
  area_hectares: zNumber(0.01, 10_000_000, "Informe a área em hectares. Ex.: 48,5"),
  crop: zOptText(40),
  planting_date: zOptDate,
  stage: z.preprocess((v) => (v === "" || v == null ? null : v), z.enum(["inicial", "desenvolvimento", "medio", "final"]).nullable()),
  soil_awc_mm: zOptNumber(10, 400, "Informe entre 10 e 400 mm."),
  notes: zOptText(1000),
});

function readField(fd: FormData) {
  return FieldSchema.safeParse({
    name: text(fd, "name"),
    area_hectares: text(fd, "area_hectares"),
    crop: text(fd, "crop"),
    planting_date: text(fd, "planting_date"),
    stage: text(fd, "stage"),
    soil_awc_mm: text(fd, "soil_awc_mm"),
    notes: text(fd, "notes"),
  });
}

export async function createField(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, user } = await requireCtx();
  const parsed = readField(fd);
  if (!parsed.success) return fail("Revise os campos destacados.", zodFieldErrors(parsed.error));
  const { error } = await supabase.from("fields").insert({ user_id: user.id, ...parsed.data });
  if (error) return fail(dbMessage(error));
  return done("Talhão cadastrado.", PATHS);
}

export async function updateField(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireCtx();
  const id = zUuid.safeParse(text(fd, "id"));
  if (!id.success) return fail("Talhão inválido.");
  const parsed = readField(fd);
  if (!parsed.success) return fail("Revise os campos destacados.", zodFieldErrors(parsed.error));
  const { error } = await supabase.from("fields").update(parsed.data).eq("id", id.data);
  if (error) return fail(dbMessage(error));
  return done("Talhão atualizado.", PATHS);
}

export async function deleteField(fd: FormData): Promise<void> {
  const { supabase } = await requireCtx();
  const id = zUuid.safeParse(text(fd, "id"));
  if (!id.success) return;
  const { error } = await supabase.from("fields").delete().eq("id", id.data);
  if (error) throw new Error(dbMessage(error));
  done("", PATHS);
}

const SeasonSchema = z
  .object({
    name: z.string().trim().min(1, "Informe o nome da safra. Ex.: Safra 2025/26").max(60, "Máximo de 60 caracteres."),
    start_date: zOptDate,
    end_date: zOptDate,
  })
  .refine((s) => !s.start_date || !s.end_date || s.end_date >= s.start_date, { path: ["end_date"], message: "O fim não pode ser antes do início." });

export async function createSeason(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, user } = await requireCtx();
  const parsed = SeasonSchema.safeParse({ name: text(fd, "name"), start_date: text(fd, "start_date"), end_date: text(fd, "end_date") });
  if (!parsed.success) return fail("Revise os campos destacados.", zodFieldErrors(parsed.error));
  const { error } = await supabase.from("seasons").insert({ user_id: user.id, ...parsed.data });
  if (error) return fail(dbMessage(error));
  return done("Safra criada.", PATHS);
}

export async function deleteSeason(fd: FormData): Promise<void> {
  const { supabase } = await requireCtx();
  const id = zUuid.safeParse(text(fd, "id"));
  if (!id.success) return;
  const { error } = await supabase.from("seasons").delete().eq("id", id.data);
  if (error) throw new Error(dbMessage(error));
  done("", PATHS);
}

const HarvestSchema = z.object({
  season_id: zUuid,
  field_id: zUuid,
  crop: z.string().trim().min(1, "Informe a cultura.").max(40),
  amount: zNumber(0.001, 1_000_000_000, "Informe a quantidade colhida."),
  unit: z.enum(["sc60", "kg", "t", "arroba"], { message: "Escolha a unidade." }),
  harvested_on: zOptDate,
  notes: zOptText(500),
});

export async function createHarvest(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, user } = await requireCtx();
  const parsed = HarvestSchema.safeParse({
    season_id: text(fd, "season_id"),
    field_id: text(fd, "field_id"),
    crop: text(fd, "crop"),
    amount: text(fd, "amount"),
    unit: text(fd, "unit"),
    harvested_on: text(fd, "harvested_on"),
    notes: text(fd, "notes"),
  });
  if (!parsed.success) return fail("Revise os campos destacados.", zodFieldErrors(parsed.error));
  const { error } = await supabase.from("harvests").insert({ user_id: user.id, ...parsed.data });
  if (error) return fail(dbMessage(error));
  return done("Colheita registrada.", PATHS);
}

export async function deleteHarvest(fd: FormData): Promise<void> {
  const { supabase } = await requireCtx();
  const id = zUuid.safeParse(text(fd, "id"));
  if (!id.success) return;
  const { error } = await supabase.from("harvests").delete().eq("id", id.data);
  if (error) throw new Error(dbMessage(error));
  done("", PATHS);
}
