import type { Metadata } from "next";
import { getAuthContext } from "@/lib/supabase/server";
import { getProperty } from "@/lib/data";
import { WeatherDashboard } from "@/components/weather/weather-dashboard";

export const metadata: Metadata = { title: "Clima" };

export default async function ClimatePage() {
  const { supabase, user } = await getAuthContext();
  const property = await getProperty(supabase, user!.id);

  const initialLocation =
    property?.latitude != null && property.longitude != null
      ? {
          lat: property.latitude,
          lon: property.longitude,
          label: `${property.name} · ${property.municipality} – ${property.state}`,
          municipality: property.municipality,
          uf: property.state,
        }
      : null;
  const pendingGeocode =
    !initialLocation && property ? { municipality: property.municipality, uf: property.state } : null;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-6 pb-10 sm:px-6 sm:pt-10">
      <h1 className="text-2xl font-semibold tracking-tight">Clima e alertas</h1>
      <p className="mb-5 text-sm text-muted">Previsão real por localização, com alertas de geada e eventos extremos.</p>
      <WeatherDashboard initialLocation={initialLocation} pendingGeocode={pendingGeocode} />
    </div>
  );
}
