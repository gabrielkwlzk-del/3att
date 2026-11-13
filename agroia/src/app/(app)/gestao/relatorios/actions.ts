"use server";

import { isAiConfigured } from "@/lib/env";
import { AiUnavailableError, summarizeReport } from "@/lib/ai/farm-ai";
import { memoryRateLimit } from "@/lib/rate-limit";
import type { ActionState } from "@/lib/farm/action-state";
import { loadFields, loadSeasons } from "@/lib/farm/data";
import { buildReportData, reportForAi } from "@/lib/farm/report";
import { dbMessage, done, fail, requireCtx, text, zUuid } from "@/lib/farm/server";

export async function generateReportSummary(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, user } = await requireCtx();
  const id = zUuid.safeParse(text(fd, "season_id"));
  if (!id.success) return fail("Escolha uma safra.");
  if (!isAiConfigured()) return fail("A IA ainda não foi configurada neste servidor.");
  if (!memoryRateLimit(`report:${user.id}`, 5, 10 * 60 * 1000)) return fail("Muitos resumos em pouco tempo. Aguarde alguns minutos.");

  const [seasons, fields] = await Promise.all([loadSeasons(supabase), loadFields(supabase)]);
  const season = seasons.find((s) => s.id === id.data);
  if (!season) return fail("Safra não encontrada.");
  const data = await buildReportData(supabase, season, seasons, fields);
  if (data.row.summary.receita + data.row.summary.despesa + data.row.summary.investimento === 0 && data.productivity.length === 0) {
    return fail("Esta safra ainda não tem lançamentos nem colheitas para resumir.");
  }

  try {
    const { text: content, model } = await summarizeReport(reportForAi(data));
    const { error } = await supabase.from("report_summaries").insert({ user_id: user.id, season_id: season.id, content, model });
    if (error) return fail(dbMessage(error));
    return done("Resumo gerado.", ["/gestao/relatorios"]);
  } catch (error) {
    return fail(error instanceof AiUnavailableError ? error.message : "Não foi possível gerar o resumo agora.");
  }
}
