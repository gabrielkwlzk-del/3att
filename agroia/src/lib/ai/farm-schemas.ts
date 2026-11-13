import { z } from "zod";

/**
 * Esquemas e leitura das respostas da IA nos módulos de gestão. Arquivo sem dependências de servidor
 * para poder ser testado: a IA pode devolver JSON com cercas de código, texto extra, números onde
 * esperamos texto ou classificações que não conhecemos, e nada disso deve quebrar a tela.
 */

export function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? raw;
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("sem JSON");
  return JSON.parse(fenced.slice(start, end + 1));
}


const classification = z.enum(["muito_baixo", "baixo", "medio", "adequado", "alto", "muito_alto", "nao_classificado"]).catch("nao_classificado");

export const SoilAnalysisSchema = z.object({
  is_soil_report: z.boolean().catch(true),
  laboratory: z.string().nullish(),
  sample_date: z.string().nullish(),
  depth: z.string().nullish(),
  identification: z.string().nullish(),
  indicators: z
    .array(
      z.object({
        name: z.string(),
        symbol: z.string().nullish(),
        value: z.union([z.string(), z.number()]).nullish().transform((v) => (v == null ? null : String(v))),
        unit: z.string().nullish(),
        classification,
        note: z.string().nullish(),
      }),
    )
    .max(80),
  summary: z.string(),
  limitations: z.array(z.string()).max(15).catch([]),
  questions_for_agronomist: z.array(z.string()).max(12).catch([]),
  quality_notes: z.string().nullish(),
});
export type SoilAnalysis = z.infer<typeof SoilAnalysisSchema>;


export const YieldAdjustmentSchema = z.object({
  adjustment_pct: z.number().catch(0),
  confidence: z.enum(["baixa", "media", "alta"]).catch("baixa"),
  factors: z.array(z.string()).max(8).catch([]),
  risks: z.array(z.string()).max(8).catch([]),
  what_would_improve: z.array(z.string()).max(6).catch([]),
});
export type YieldAdjustment = z.infer<typeof YieldAdjustmentSchema>;

