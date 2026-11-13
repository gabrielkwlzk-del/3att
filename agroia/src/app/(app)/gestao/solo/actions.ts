"use server";

import { z } from "zod";
import { isAiConfigured } from "@/lib/env";
import { analyzeSoilPdf, AiUnavailableError } from "@/lib/ai/farm-ai";
import { memoryRateLimit } from "@/lib/rate-limit";
import { revalidatePath } from "next/cache";
import { dbMessage, requireCtx, text, zOptDate, zOptUuid, zUuid } from "@/lib/farm/server";

const MAX_BYTES = 10 * 1024 * 1024;
const MONTHLY_LIMIT = 15;

const InputSchema = z.object({
  path: z.string().min(5).max(300),
  fileName: z.string().trim().min(1).max(200),
  fieldId: zOptUuid,
  sampleOn: zOptDate,
});

export type SoilResult = { ok: boolean; message: string };

/** O navegador envia o PDF direto ao Storage (pasta do usuário) e chama esta ação com o caminho. */
export async function analyzeSoilReport(raw: { path: string; fileName: string; fieldId: string; sampleOn: string }): Promise<SoilResult> {
  const { supabase, user } = await requireCtx();
  const parsed = InputSchema.safeParse(raw);
  if (!parsed.success || !parsed.data.path.startsWith(`${user.id}/`) || parsed.data.path.includes("..") || !/\.pdf$/i.test(parsed.data.path)) {
    return { ok: false, message: "Arquivo inválido." };
  }
  const { path, fileName, fieldId, sampleOn } = parsed.data;
  const discard = async () => void (await supabase.storage.from("soil-reports").remove([path]));

  if (!isAiConfigured()) {
    await discard();
    return { ok: false, message: "A análise por IA ainda não foi configurada neste servidor." };
  }
  if (!memoryRateLimit(`soil:${user.id}`, 5, 10 * 60 * 1000)) {
    await discard();
    return { ok: false, message: "Muitos laudos em pouco tempo. Aguarde alguns minutos." };
  }
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const { count } = await supabase.from("soil_reports").select("id", { count: "exact", head: true }).gte("created_at", monthAgo);
  if ((count ?? 0) >= MONTHLY_LIMIT) {
    await discard();
    return { ok: false, message: `Limite de ${MONTHLY_LIMIT} laudos a cada 30 dias atingido.` };
  }

  const { data: blob, error: dlError } = await supabase.storage.from("soil-reports").download(path);
  if (dlError || !blob) return { ok: false, message: "Não foi possível ler o arquivo enviado. Tente de novo." };
  const bytes = Buffer.from(await blob.arrayBuffer());
  if (bytes.length > MAX_BYTES || bytes.subarray(0, 5).toString("latin1") !== "%PDF-") {
    await discard();
    return { ok: false, message: "O arquivo precisa ser um PDF de até 10 MB." };
  }

  let fieldName: string | null = null;
  let crop: string | null = null;
  if (fieldId) {
    const { data: f } = await supabase.from("fields").select("name, crop").eq("id", fieldId).maybeSingle();
    fieldName = (f?.name as string | undefined) ?? null;
    crop = (f?.crop as string | undefined) ?? null;
  }

  const { data: row, error: insertError } = await supabase
    .from("soil_reports")
    .insert({ user_id: user.id, field_id: fieldId, sample_on: sampleOn, file_path: path, file_name: fileName, status: "processing" })
    .select("id")
    .single();
  if (insertError || !row) {
    await discard();
    return { ok: false, message: dbMessage(insertError) };
  }

  try {
    const { analysis, model } = await analyzeSoilPdf(bytes, { fieldName, crop });
    await supabase.from("soil_reports").update({ status: "done", analysis, model, error: null }).eq("id", row.id);
    revalidatePath("/gestao/solo");
    revalidatePath("/gestao");
    return { ok: true, message: analysis.is_soil_report ? "Laudo analisado." : "O arquivo não parece ser um laudo de solo." };
  } catch (error) {
    const message = error instanceof AiUnavailableError ? error.message : "Não foi possível analisar o laudo agora.";
    await supabase.from("soil_reports").update({ status: "error", error: message }).eq("id", row.id);
    revalidatePath("/gestao/solo");
    return { ok: false, message };
  }
}

export async function deleteSoilReport(fd: FormData): Promise<void> {
  const { supabase, user } = await requireCtx();
  const id = zUuid.safeParse(text(fd, "id"));
  if (!id.success) return;
  const { data: row } = await supabase.from("soil_reports").select("file_path").eq("id", id.data).maybeSingle();
  const { error } = await supabase.from("soil_reports").delete().eq("id", id.data);
  if (error) throw new Error(dbMessage(error));
  if (row?.file_path && String(row.file_path).startsWith(`${user.id}/`)) await supabase.storage.from("soil-reports").remove([String(row.file_path)]);
  revalidatePath("/gestao/solo");
  revalidatePath("/gestao");
}
