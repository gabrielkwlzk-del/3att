"use server";

import { isAiConfigured } from "@/lib/env";
import { adjustYield, AiUnavailableError, type YieldAdjustment } from "@/lib/ai/farm-ai";
import { memoryRateLimit } from "@/lib/rate-limit";
import type { ActionState } from "@/lib/farm/action-state";
import { dbMessage, done, fail, requireCtx, text, zUuid } from "@/lib/farm/server";
import { fetchDailyHistory, geocodeMunicipality, WeatherUnavailableError } from "@/lib/weather/open-meteo";
import { applyAdjustment, baseline, weatherStress, type WeatherStress } from "@/lib/farm/yield";
import { toKg, type HarvestUnit } from "@/lib/farm/units";
import { normalizeText, todayBR } from "@/lib/farm/format";

export async function generateForecast(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, user } = await requireCtx();
  const id = zUuid.safeParse(text(fd, "field_id"));
  if (!id.success) return fail("Escolha um talhão.");
  if (!memoryRateLimit(`yield:${user.id}`, 10, 10 * 60 * 1000)) return fail("Muitas estimativas em pouco tempo. Aguarde alguns minutos.");

  const { data: field } = await supabase.from("fields").select("id, name, area_hectares, crop, stage, planting_date, notes").eq("id", id.data).maybeSingle();
  if (!field) return fail("Talhão não encontrado.");
  if (!field.crop) return fail("Informe a cultura do talhão (em Talhões e safras) antes de estimar.");
  const area = Number(field.area_hectares);
  const crop = normalizeText(String(field.crop));

  // Histórico do próprio talhão: kg/ha por safra, só da mesma cultura
  const { data: hs } = await supabase.from("harvests").select("season_id, crop, amount, unit").eq("field_id", field.id);
  const { data: seasons } = await supabase.from("seasons").select("id, name");
  const seasonName = new Map((seasons ?? []).map((s) => [s.id as string, s.name as string]));
  const perSeason = new Map<string, number>();
  for (const h of (hs ?? []) as { season_id: string; crop: string; amount: number; unit: HarvestUnit }[]) {
    if (normalizeText(h.crop) !== crop) continue;
    perSeason.set(h.season_id, (perSeason.get(h.season_id) ?? 0) + toKg(Number(h.amount), h.unit) / area);
  }
  const history = [...perSeason.entries()].map(([sid, kgHa]) => ({ season: seasonName.get(sid) ?? "Safra", kgHa: Math.round(kgHa) }));
  const base = baseline(history.map((h) => h.kgHa));
  if (base.n < 2 || base.low == null || base.high == null || base.mean == null) {
    return fail(base.n === 0 ? "Este talhão não tem colheitas registradas dessa cultura. Registre ao menos 2 safras para estimar." : "Só há 1 safra registrada. Com uma safra não dá para medir a variação; registre ao menos 2.");
  }

  // Clima desde o plantio (indicadores medidos), se houver data de plantio e localização
  let stress: WeatherStress | null = null;
  let weatherNote: string | null = null;
  if (field.planting_date) {
    const { data: prop } = await supabase.from("properties").select("municipality, state, latitude, longitude").maybeSingle();
    let coords: { lat: number; lon: number } | null = prop?.latitude != null && prop?.longitude != null ? { lat: Number(prop.latitude), lon: Number(prop.longitude) } : null;
    try {
      if (!coords && prop) {
        const geo = await geocodeMunicipality(String(prop.municipality), String(prop.state));
        coords = geo ? { lat: geo.latitude, lon: geo.longitude } : null;
      }
      if (coords) {
        const days = await fetchDailyHistory(coords.lat, coords.lon, String(field.planting_date), todayBR());
        stress = weatherStress(days);
      } else weatherNote = "Sem localização da propriedade: o clima não entrou na estimativa.";
    } catch (e) {
      weatherNote = e instanceof WeatherUnavailableError ? "Clima indisponível agora: não entrou na estimativa." : "Clima indisponível.";
    }
  } else weatherNote = "Sem data de plantio no talhão: o clima do ciclo não entrou na estimativa.";

  // Ajuste qualitativo da IA (limitado a −30% / +15%); sem IA, sem ajuste
  let adjustment: YieldAdjustment | null = null;
  let model: string | null = null;
  let aiNote: string | null = null;
  if (isAiConfigured()) {
    try {
      const r = await adjustYield({
        cultura: field.crop, estagio_informado: field.stage, data_plantio: field.planting_date, area_ha: area,
        faixa_historica_kg_ha: { n_safras: base.n, mediana_ou_media: Math.round(base.mean), p10: Math.round(base.low), p90: Math.round(base.high), safras: history },
        clima_desde_plantio: stress, observacoes_do_produtor: field.notes,
      });
      adjustment = r.adjustment;
      model = r.model;
    } catch (e) {
      aiNote = e instanceof AiUnavailableError ? e.message : "Ajuste por IA indisponível.";
    }
  } else aiNote = "IA não configurada: a estimativa usa só o histórico.";

  const range = applyAdjustment(base, adjustment?.adjustment_pct ?? 0)!;
  const { error } = await supabase.from("yield_forecasts").insert({
    user_id: user.id, field_id: field.id, crop: String(field.crop),
    low_kg_ha: Math.round(range.low), mid_kg_ha: Math.round(range.mid), high_kg_ha: Math.round(range.high),
    inputs: { baseline: base, history, stress, adjustment, weatherNote, aiNote, stage: field.stage, planting_date: field.planting_date },
    narrative: adjustment ? [...adjustment.factors].join("\n") : null, model,
  });
  if (error) return fail(dbMessage(error));
  return done("Estimativa gerada.", ["/gestao/produtividade"]);
}
