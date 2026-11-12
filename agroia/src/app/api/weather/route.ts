import { z } from "zod";
import { getAuthContext } from "@/lib/supabase/server";
import { fetchForecast, WeatherUnavailableError } from "@/lib/weather/open-meteo";

const QuerySchema = z.object({
  lat: z.coerce.number().min(-35).max(6),
  lon: z.coerce.number().min(-75).max(-28),
  label: z.string().max(140).optional(),
});

/** Previsão para uma coordenada no Brasil. Exige login para evitar uso abusivo. */
export async function GET(request: Request) {
  const { user } = await getAuthContext();
  if (!user) return Response.json({ error: "Faça login para continuar." }, { status: 401 });

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = QuerySchema.safeParse(params);
  if (!parsed.success) {
    return Response.json({ error: "Localização inválida (use coordenadas dentro do Brasil)." }, { status: 400 });
  }

  try {
    const forecast = await fetchForecast(parsed.data.lat, parsed.data.lon, parsed.data.label ?? "Local selecionado");
    return Response.json(forecast, { headers: { "Cache-Control": "private, max-age=600" } });
  } catch (error) {
    const message =
      error instanceof WeatherUnavailableError ? error.message : "Previsão do tempo indisponível no momento.";
    return Response.json({ error: message }, { status: 503 });
  }
}
