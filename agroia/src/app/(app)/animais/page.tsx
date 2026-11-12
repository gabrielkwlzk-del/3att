import type { Metadata } from "next";
import { getAuthContext } from "@/lib/supabase/server";
import { getProperty } from "@/lib/data";
import { SPECIES, type SpeciesValue } from "@/lib/domain";
import { LivestockAssistant } from "@/components/livestock-assistant";

export const metadata: Metadata = { title: "Animais" };

export default async function LivestockPage() {
  const { supabase, user } = await getAuthContext();
  const property = await getProperty(supabase, user!.id);
  const firstSpecies = property?.animals.find((a) => SPECIES.some((s) => s.value === a.species))?.species as
    | SpeciesValue
    | undefined;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-6 pb-10 sm:px-6 sm:pt-10">
      <h1 className="text-2xl font-semibold tracking-tight">Assistente de pecuária</h1>
      <p className="mb-5 text-sm text-muted">Manejo, nutrição, instalações e prevenção para a sua criação.</p>
      <LivestockAssistant defaultSpecies={firstSpecies ?? "bovinos_corte"} />
    </div>
  );
}
