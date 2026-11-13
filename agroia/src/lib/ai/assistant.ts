import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { serverEnv } from "@/lib/env";
import { getAnthropic as getClient } from "./client";
import { UFS, ufName, type PropertyRow, type Source, type Topic } from "@/lib/domain";
import { BASE_SYSTEM_PROMPT, buildContextBlock } from "./system-prompt";
import type { KnowledgeChunk } from "./knowledge";
import { fetchForecast, geocodeMunicipality, WeatherUnavailableError } from "@/lib/weather/open-meteo";
import { formatDayLabel, weatherDescription } from "@/lib/weather/codes";

/**
 * Motor do assistente, independente de canal (web hoje, WhatsApp no futuro).
 * Recebe o histórico já montado, transmite eventos e devolve a resposta final.
 */

type MessageParam = Anthropic.Beta.BetaMessageParam;

export type AssistantEvent =
  | { type: "status"; status: "thinking" | "weather" | "searching" | "writing"; label: string }
  | { type: "delta"; text: string }
  | { type: "reset" };

export type AssistantResult = {
  text: string;
  status: "complete" | "refused" | "error";
  sources: Source[];
  model: string;
  inputTokens: number;
  outputTokens: number;
};

/** Domínios oficiais e acadêmicos permitidos na busca (subdomínios incluídos). */
export const OFFICIAL_DOMAINS = [
  "embrapa.br",
  "gov.br",
  "scielo.br",
  "usp.br",
  "unesp.br",
  "unicamp.br",
  "ufv.br",
  "ufla.br",
  "ufpr.br",
  "ufrgs.br",
  "ufsm.br",
  "ufg.br",
  "ufmt.br",
];

/** Modelos que aceitam fallback no servidor com `fallbacks: "default"`. */
const FALLBACK_MODELS = new Set([
  "claude-fable-5-2",
  "claude-fable-5-1",
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-sonnet-5-5",
]);

const REFUSAL_TEXT =
  "Não consigo ajudar com esse pedido. Se for uma dúvida sobre sua lavoura, seus animais ou o clima, tente reformular com mais detalhes.";

const UF_CODES = UFS.map((u) => u.sigla) as [string, ...string[]];

function weatherTool(property: PropertyRow | null, onEvent: (e: AssistantEvent) => void) {
  return betaZodTool({
    name: "consultar_previsao_tempo",
    description:
      "Consulta a previsão do tempo REAL (fonte: Open-Meteo) para os próximos dias: temperatura máxima e mínima, chuva prevista e probabilidade, vento e rajadas, umidade, evapotranspiração, alertas de geada e eventos extremos calculados a partir da previsão e janelas com condições favoráveis à pulverização nas próximas 48 h. Se município e UF não forem informados, usa a localização cadastrada da propriedade do produtor (quando houver).",
    inputSchema: z.object({
      municipio: z
        .string()
        .min(2)
        .max(120)
        .optional()
        .describe("Nome do município brasileiro. Omita para usar a localização da propriedade."),
      uf: z.enum(UF_CODES).optional().describe("Sigla do estado, ex.: PR. Obrigatória quando o município for informado."),
      latitude: z.number().min(-35).max(6).optional().describe("Latitude, quando o produtor informar coordenadas."),
      longitude: z.number().min(-75).max(-28).optional().describe("Longitude, quando o produtor informar coordenadas."),
      dias: z.number().int().min(1).max(14).optional().describe("Quantidade de dias de previsão (padrão 7)."),
    }),
    run: async ({ municipio, uf, latitude, longitude, dias }) => {
      onEvent({ type: "status", status: "weather", label: "Consultando a previsão do tempo…" });

      let target: { latitude: number; longitude: number; label: string } | null = null;
      if (latitude != null && longitude != null) {
        target = { latitude, longitude, label: `Coordenadas ${latitude.toFixed(3)}, ${longitude.toFixed(3)}` };
      } else if (municipio && uf) {
        target = await geocodeMunicipality(municipio, uf);
        if (!target) throw new Error(`Município "${municipio} – ${uf}" não encontrado. Peça ao produtor para confirmar o nome.`);
      } else if (property?.latitude != null && property.longitude != null) {
        target = {
          latitude: property.latitude,
          longitude: property.longitude,
          label: `${property.municipality} – ${property.state}`,
        };
      } else if (property?.municipality && property.state) {
        target = await geocodeMunicipality(property.municipality, property.state);
      }

      if (!target) {
        throw new Error(
          "Localização desconhecida. Pergunte ao produtor o município e o estado, ou sugira cadastrar a propriedade no perfil.",
        );
      }

      try {
        const forecast = await fetchForecast(target.latitude, target.longitude, target.label, dias ?? 7);
        const today = forecast.daily[0]?.date;
        return JSON.stringify({
          fonte: "Open-Meteo (open-meteo.com) — previsão numérica; incerteza aumenta com o prazo",
          local: forecast.location.label,
          fuso: forecast.location.timezone,
          altitude_m: forecast.location.elevation,
          agora: {
            horario_local: forecast.current.time,
            temperatura_c: forecast.current.temperature,
            sensacao_c: forecast.current.apparentTemperature,
            umidade_pct: forecast.current.humidity,
            vento_kmh: forecast.current.windKmh,
            rajada_kmh: forecast.current.gustKmh,
            condicao: weatherDescription(forecast.current.weatherCode),
          },
          dias: forecast.daily.map((d) => ({
            data: d.date,
            dia: formatDayLabel(d.date, today),
            condicao: weatherDescription(d.weatherCode),
            max_c: d.tempMax,
            min_c: d.tempMin,
            chuva_mm: d.precipitationMm,
            prob_chuva_pct: d.precipitationProbability,
            vento_max_kmh: d.windMaxKmh,
            rajada_max_kmh: d.gustMaxKmh,
            umidade_min_pct: d.humidityMin,
            et0_mm: d.et0Mm,
          })),
          alertas: forecast.alerts.map((a) => ({ nivel: a.level, titulo: a.title, descricao: a.description, datas: a.dates })),
          janelas_pulverizacao_48h: {
            criterio:
              "temperatura ≤ 30 °C, umidade ≥ 55 %, vento a 10 m entre 3 e 10 km/h, chance de chuva ≤ 20 % (referência geral de boas práticas)",
            janelas: forecast.sprayWindows,
          },
        });
      } catch (error) {
        if (error instanceof WeatherUnavailableError) {
          throw new Error(`${error.message} Informe ao produtor que a previsão está indisponível agora e NÃO estime valores.`);
        }
        throw error;
      }
    },
  });
}

export async function runAssistant(input: {
  messages: MessageParam[];
  topic: Topic;
  property: PropertyRow | null;
  knowledge: KnowledgeChunk[];
  /** Modelo escolhido pelo plano; vazio usa AI_MODEL. */
  model?: string;
  signal?: AbortSignal;
  onEvent: (event: AssistantEvent) => void;
}): Promise<AssistantResult> {
  const { messages, topic, property, knowledge, signal, onEvent } = input;
  const model = input.model || serverEnv.aiModel;
  const useFallback = serverEnv.aiRefusalFallback && FALLBACK_MODELS.has(model);
  const sharedProperty = property?.share_with_ai ? property : null;

  const tools: Parameters<Anthropic["beta"]["messages"]["toolRunner"]>[0]["tools"] = [
    weatherTool(sharedProperty, onEvent),
  ];
  // A busca web dinâmica não é oferecida no Haiku; nele o assistente responde sem ela.
  if (serverEnv.aiWebSearch && !model.includes("haiku")) {
    tools.push({
      type: "web_search_20260209",
      name: "web_search",
      max_uses: serverEnv.aiWebSearchMaxUses,
      allowed_domains: OFFICIAL_DOMAINS,
      user_location: {
        type: "approximate",
        country: "BR",
        ...(sharedProperty ? { region: ufName(sharedProperty.state), city: sharedProperty.municipality } : {}),
      },
    });
  }

  const runner = getClient().beta.messages.toolRunner(
    {
      model,
      max_tokens: 32000,
      stream: true,
      thread: false,
      max_iterations: 6,
      output_config: { effort: serverEnv.aiEffort },
      ...(useFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      system: [
        { type: "text", text: BASE_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
        { type: "text", text: buildContextBlock(topic, sharedProperty) },
      ],
      tools,
      messages,
    },
    { signal },
  );

  let text = "";
  let refused = false;
  let servedBy = model;
  let inputTokens = 0;
  let outputTokens = 0;
  const webSources = new Map<string, Source>();

  onEvent({ type: "status", status: "thinking", label: "Analisando…" });

  for await (const stream of runner) {
    for await (const event of stream) {
      if (event.type === "content_block_start") {
        const block = event.content_block;
        if (block.type === "server_tool_use") {
          onEvent({ type: "status", status: "searching", label: "Buscando em fontes oficiais…" });
        } else if (block.type === "thinking") {
          onEvent({ type: "status", status: "thinking", label: "Analisando…" });
        } else if (block.type === "text") {
          onEvent({ type: "status", status: "writing", label: "Escrevendo…" });
        }
      } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        text += event.delta.text;
        onEvent({ type: "delta", text: event.delta.text });
      }
    }

    const message = await stream.finalMessage();
    servedBy = message.model ?? servedBy;
    inputTokens +=
      (message.usage.input_tokens ?? 0) +
      (message.usage.cache_creation_input_tokens ?? 0) +
      (message.usage.cache_read_input_tokens ?? 0);
    outputTokens += message.usage.output_tokens ?? 0;

    for (const block of message.content) {
      if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
        for (const result of block.content) {
          if (!webSources.has(result.url)) {
            webSources.set(result.url, { kind: "web", title: result.title, url: result.url, cited: false });
          }
        }
      }
      if (block.type === "text" && block.citations) {
        for (const citation of block.citations) {
          if (citation.type === "web_search_result_location") {
            const existing = webSources.get(citation.url);
            webSources.set(citation.url, {
              kind: "web",
              title: existing?.title ?? citation.title ?? citation.url,
              url: citation.url,
              cited: true,
            });
          }
        }
      }
    }

    // Recusa por política: descarta o parcial (inclusive após fallback que também recusou).
    if (message.stop_reason === "refusal") {
      refused = true;
      break;
    }
    // Entrada de ferramenta truncada: não deixar o runner executar com dados incompletos.
    if (message.stop_reason === "max_tokens" && message.content.some((b) => b.type === "tool_use")) {
      break;
    }
  }

  if (refused) {
    onEvent({ type: "reset" });
    onEvent({ type: "delta", text: REFUSAL_TEXT });
    return { text: REFUSAL_TEXT, status: "refused", sources: [], model: servedBy, inputTokens, outputTokens };
  }

  const finalText = text.trim();
  if (!finalText) {
    const fallbackText = "Não consegui concluir a resposta agora. Por favor, tente novamente em instantes.";
    onEvent({ type: "delta", text: fallbackText });
    return { text: fallbackText, status: "error", sources: [], model: servedBy, inputTokens, outputTokens };
  }

  const kbSources: Source[] = knowledge.map((chunk, i) => ({
    kind: "knowledge_base",
    title: chunk.title,
    url: chunk.url,
    institution: chunk.institution,
    cited: finalText.includes(`[${i + 1}]`),
  }));

  const web = [...webSources.values()];
  const citedWeb = web.filter((s) => s.cited);
  const sources: Source[] = [
    ...kbSources.filter((s) => s.cited),
    ...(citedWeb.length ? citedWeb : web.slice(0, 4)),
  ];

  return { text: finalText, status: "complete", sources: dedupeSources(sources), model: servedBy, inputTokens, outputTokens };
}

function dedupeSources(sources: Source[]): Source[] {
  const seen = new Set<string>();
  return sources.filter((s) => {
    const key = `${s.kind}:${s.url ?? s.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Converte erros do provedor em mensagens amigáveis (sem vazar detalhes internos). */
export function describeAiError(error: unknown): { message: string; status: number } {
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return { message: "O serviço de IA não está configurado corretamente. Avise o administrador.", status: 503 };
  }
  if (error instanceof Anthropic.RateLimitError) {
    return { message: "Muitas solicitações ao serviço de IA agora. Tente de novo em alguns instantes.", status: 429 };
  }
  if (error instanceof Anthropic.BadRequestError) {
    return { message: "Não foi possível processar esta mensagem (formato ou tamanho inválido).", status: 400 };
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return { message: "Sem conexão com o serviço de IA. Verifique a internet e tente novamente.", status: 503 };
  }
  if (error instanceof Anthropic.APIError) {
    return { message: "O serviço de IA está instável no momento. Tente novamente em instantes.", status: 503 };
  }
  return { message: "Ocorreu um erro inesperado ao gerar a resposta.", status: 500 };
}
