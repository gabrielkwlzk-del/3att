import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Stage } from "./water";

export type FieldRec = {
  id: string;
  name: string;
  areaHectares: number;
  crop: string | null;
  plantingDate: string | null;
  stage: Stage | null;
  soilAwcMm: number | null;
  notes: string | null;
};

export type SeasonRec = { id: string; name: string; startDate: string | null; endDate: string | null };

export async function loadFields(supabase: SupabaseClient): Promise<FieldRec[]> {
  const { data } = await supabase.from("fields").select("id, name, area_hectares, crop, planting_date, stage, soil_awc_mm, notes").order("name");
  return ((data ?? []) as Record<string, unknown>[]).map((f) => ({
    id: f.id as string,
    name: f.name as string,
    areaHectares: Number(f.area_hectares),
    crop: (f.crop as string | null) ?? null,
    plantingDate: (f.planting_date as string | null) ?? null,
    stage: (f.stage as Stage | null) ?? null,
    soilAwcMm: f.soil_awc_mm != null ? Number(f.soil_awc_mm) : null,
    notes: (f.notes as string | null) ?? null,
  }));
}

/** Safras da mais recente para a mais antiga. */
export async function loadSeasons(supabase: SupabaseClient): Promise<SeasonRec[]> {
  const { data } = await supabase.from("seasons").select("id, name, start_date, end_date").order("start_date", { ascending: false, nullsFirst: false }).order("name", { ascending: false });
  return ((data ?? []) as Record<string, unknown>[]).map((s) => ({
    id: s.id as string,
    name: s.name as string,
    startDate: (s.start_date as string | null) ?? null,
    endDate: (s.end_date as string | null) ?? null,
  }));
}

/** Safra escolhida por ?safra=; sem parâmetro válido, a mais recente. */
export function pickSeason<T extends { id: string }>(seasons: T[], param: string | string[] | undefined): T | null {
  const id = Array.isArray(param) ? param[0] : param;
  return seasons.find((s) => s.id === id) ?? seasons[0] ?? null;
}

export const optionsOf = <T extends { id: string; name: string }>(rows: T[]) => rows.map((r) => ({ value: r.id, label: r.name }));

/** Como `pickSeason`, mas `?safra=todas` devolve null (todas as safras). */
export function selectSeason<T extends { id: string }>(seasons: T[], param: string | string[] | undefined): { season: T | null; all: boolean } {
  const id = Array.isArray(param) ? param[0] : param;
  if (id === "todas") return { season: null, all: true };
  return { season: pickSeason(seasons, id), all: false };
}
