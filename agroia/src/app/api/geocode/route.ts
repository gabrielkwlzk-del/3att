import { z } from "zod";
import { getAuthContext } from "@/lib/supabase/server";
import { UFS } from "@/lib/domain";
import { geocodeMunicipality, WeatherUnavailableError } from "@/lib/weather/open-meteo";

const QuerySchema = z.object({
  municipio: z.string().trim().min(2).max(120),
  uf: z.enum(UFS.map((u) => u.sigla) as [string, ...string[]]),
});

export async function GET(request: Request) {
  const { user } = await getAuthContext();
  if (!user) return Response.json({ error: "Faça login para continuar." }, { status: 401 });

  const parsed = QuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return Response.json({ error: "Informe município e estado." }, { status: 400 });

  try {
    const result = await geocodeMunicipality(parsed.data.municipio, parsed.data.uf);
    if (!result) return Response.json({ error: "Município não encontrado neste estado." }, { status: 404 });
    return Response.json(result);
  } catch (error) {
    const message = error instanceof WeatherUnavailableError ? error.message : "Serviço de localização indisponível.";
    return Response.json({ error: message }, { status: 503 });
  }
}
