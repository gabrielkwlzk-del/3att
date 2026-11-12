"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuthContext } from "@/lib/supabase/server";
import { SPECIES, UFS } from "@/lib/domain";
import { geocodeMunicipality } from "@/lib/weather/open-meteo";

export type SaveState = { ok: boolean; message: string; fieldErrors?: Record<string, string> } | null;

const optionalNumber = (min: number, max: number) =>
  z.preprocess(
    (v) => (v === "" || v == null ? null : Number(String(v).replace(",", "."))),
    z.number().min(min).max(max).nullable(),
  );

const PropertySchema = z.object({
  name: z.string().trim().min(1, "Informe o nome da propriedade.").max(120),
  municipality: z.string().trim().min(2, "Informe o município.").max(120),
  state: z.enum(UFS.map((u) => u.sigla) as [string, ...string[]], { message: "Escolha o estado." }),
  area_hectares: optionalNumber(0.01, 10_000_000),
  activity: z.enum(["agricultura", "pecuaria", "mista"]),
  production_system: z.preprocess(
    (v) => (v === "" ? null : v),
    z.enum(["convencional", "organico", "agroecologico", "integracao", "outro"]).nullable(),
  ),
  crops: z.array(z.string().trim().min(1).max(40)).max(30),
  animals: z
    .array(
      z.object({
        species: z.enum(SPECIES.map((s) => s.value) as [string, ...string[]]),
        quantity: z.number().int().min(0).max(10_000_000).nullable(),
      }),
    )
    .max(SPECIES.length),
  notes: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(1000).nullable()),
  share_with_ai: z.boolean(),
  latitude: optionalNumber(-35, 6),
  longitude: optionalNumber(-75, -28),
});

export async function saveProperty(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const { supabase, user } = await getAuthContext();
  if (!user) return { ok: false, message: "Sua sessão expirou. Entre novamente." };

  const species = formData.getAll("animal_species").map(String);
  const animals = species.map((s) => {
    const raw = String(formData.get(`animal_qty_${s}`) ?? "").trim();
    const qty = raw === "" ? null : Number.parseInt(raw, 10);
    return { species: s, quantity: Number.isNaN(qty as number) ? null : qty };
  });

  const otherCrops = String(formData.get("other_crops") ?? "")
    .split(/[,;\n]/)
    .map((c) => c.trim())
    .filter(Boolean);
  const crops = Array.from(new Set([...formData.getAll("crops").map(String), ...otherCrops]));

  const parsed = PropertySchema.safeParse({
    name: formData.get("name"),
    municipality: formData.get("municipality"),
    state: formData.get("state"),
    area_hectares: formData.get("area_hectares"),
    activity: formData.get("activity"),
    production_system: formData.get("production_system") ?? "",
    crops,
    animals,
    notes: formData.get("notes") ?? "",
    share_with_ai: formData.get("share_with_ai") === "on",
    latitude: formData.get("latitude"),
    longitude: formData.get("longitude"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] ??= issue.message;
    }
    return { ok: false, message: "Revise os campos destacados.", fieldErrors };
  }

  const data = parsed.data;
  const { data: existing } = await supabase
    .from("properties")
    .select("municipality, state, latitude, longitude, share_with_ai")
    .eq("user_id", user.id)
    .maybeSingle();

  // Coordenadas: usa as do aparelho (se o produtor escolheu), senão as já salvas
  // para o mesmo município, senão localiza o município.
  let latitude = data.latitude;
  let longitude = data.longitude;
  let geocodeWarning = "";
  const sameMunicipality =
    existing && existing.municipality === data.municipality && existing.state === data.state;
  if (latitude == null || longitude == null) {
    if (sameMunicipality && existing.latitude != null && existing.longitude != null) {
      latitude = existing.latitude;
      longitude = existing.longitude;
    } else {
      try {
        const geo = await geocodeMunicipality(data.municipality, data.state);
        if (geo) {
          latitude = geo.latitude;
          longitude = geo.longitude;
        } else {
          geocodeWarning = " Não encontramos o município para a previsão do tempo; confira o nome.";
        }
      } catch {
        geocodeWarning = " Não foi possível localizar o município agora; a previsão do tempo será buscada depois.";
      }
    }
  }

  const consentChanged = !existing || existing.share_with_ai !== data.share_with_ai;
  const { error } = await supabase.from("properties").upsert(
    {
      user_id: user.id,
      ...data,
      latitude,
      longitude,
      ...(consentChanged ? { consent_updated_at: new Date().toISOString() } : {}),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    console.error("[propriedade] erro ao salvar:", error.message);
    return { ok: false, message: "Não foi possível salvar agora. Tente novamente." };
  }

  revalidatePath("/", "layout");
  return { ok: true, message: `Propriedade salva.${geocodeWarning}` };
}

export async function deleteProperty(): Promise<SaveState> {
  const { supabase, user } = await getAuthContext();
  if (!user) return { ok: false, message: "Sua sessão expirou. Entre novamente." };
  const { error } = await supabase.from("properties").delete().eq("user_id", user.id);
  if (error) return { ok: false, message: "Não foi possível excluir agora." };
  revalidatePath("/", "layout");
  return { ok: true, message: "Dados da propriedade excluídos." };
}
