/**
 * Constantes de domínio compartilhadas entre servidor e navegador.
 */

export const UFS = [
  { sigla: "AC", nome: "Acre" },
  { sigla: "AL", nome: "Alagoas" },
  { sigla: "AP", nome: "Amapá" },
  { sigla: "AM", nome: "Amazonas" },
  { sigla: "BA", nome: "Bahia" },
  { sigla: "CE", nome: "Ceará" },
  { sigla: "DF", nome: "Distrito Federal" },
  { sigla: "ES", nome: "Espírito Santo" },
  { sigla: "GO", nome: "Goiás" },
  { sigla: "MA", nome: "Maranhão" },
  { sigla: "MT", nome: "Mato Grosso" },
  { sigla: "MS", nome: "Mato Grosso do Sul" },
  { sigla: "MG", nome: "Minas Gerais" },
  { sigla: "PA", nome: "Pará" },
  { sigla: "PB", nome: "Paraíba" },
  { sigla: "PR", nome: "Paraná" },
  { sigla: "PE", nome: "Pernambuco" },
  { sigla: "PI", nome: "Piauí" },
  { sigla: "RJ", nome: "Rio de Janeiro" },
  { sigla: "RN", nome: "Rio Grande do Norte" },
  { sigla: "RS", nome: "Rio Grande do Sul" },
  { sigla: "RO", nome: "Rondônia" },
  { sigla: "RR", nome: "Roraima" },
  { sigla: "SC", nome: "Santa Catarina" },
  { sigla: "SP", nome: "São Paulo" },
  { sigla: "SE", nome: "Sergipe" },
  { sigla: "TO", nome: "Tocantins" },
] as const;

export type UF = (typeof UFS)[number]["sigla"];

export function ufName(sigla: string): string {
  return UFS.find((u) => u.sigla === sigla)?.nome ?? sigla;
}

export const CROP_OPTIONS = [
  "Soja",
  "Milho",
  "Trigo",
  "Arroz",
  "Feijão",
  "Café",
  "Cana-de-açúcar",
  "Algodão",
  "Mandioca",
  "Hortaliças",
  "Frutas",
  "Pastagem",
  "Sorgo",
  "Aveia",
  "Eucalipto",
] as const;

export const ACTIVITIES = [
  { value: "agricultura", label: "Agricultura" },
  { value: "pecuaria", label: "Pecuária" },
  { value: "mista", label: "Agricultura e pecuária" },
] as const;

export const PRODUCTION_SYSTEMS = [
  { value: "convencional", label: "Convencional" },
  { value: "organico", label: "Orgânico" },
  { value: "agroecologico", label: "Agroecológico" },
  { value: "integracao", label: "Integração lavoura-pecuária(-floresta)" },
  { value: "outro", label: "Outro" },
] as const;

export const SPECIES = [
  { value: "bovinos_corte", label: "Bovinos de corte", emoji: "🐂" },
  { value: "bovinos_leite", label: "Bovinos de leite", emoji: "🐄" },
  { value: "suinos", label: "Suínos", emoji: "🐖" },
  { value: "aves_corte", label: "Frangos de corte", emoji: "🐓" },
  { value: "aves_postura", label: "Galinhas poedeiras", emoji: "🥚" },
  { value: "ovinos", label: "Ovinos", emoji: "🐑" },
  { value: "caprinos", label: "Caprinos", emoji: "🐐" },
  { value: "peixes", label: "Peixes (piscicultura)", emoji: "🐟" },
  { value: "equinos", label: "Equinos", emoji: "🐎" },
  { value: "abelhas", label: "Abelhas (apicultura)", emoji: "🐝" },
] as const;

export type SpeciesValue = (typeof SPECIES)[number]["value"];

export function speciesLabel(value: string): string {
  return SPECIES.find((s) => s.value === value)?.label ?? value;
}

export const TOPICS = [
  "geral",
  "diagnostico",
  "agricultura",
  "clima",
  "pecuaria",
  "produtividade",
] as const;

export type Topic = (typeof TOPICS)[number];

export function isTopic(value: unknown): value is Topic {
  return typeof value === "string" && (TOPICS as readonly string[]).includes(value);
}

export const TOPIC_LABELS: Record<Topic, string> = {
  geral: "Conversa",
  diagnostico: "Problemas na plantação",
  agricultura: "Dúvida agrícola",
  clima: "Clima e planejamento",
  pecuaria: "Animais",
  produtividade: "Produtividade",
};

/** Perguntas sugeridas exibidas quando uma conversa começa. */
export const SUGGESTIONS: Record<Topic, string[]> = {
  geral: [
    "Qual a melhor época para plantar milho safrinha na minha região?",
    "Como interpretar uma análise de solo?",
    "Como fazer o manejo integrado de pragas na soja?",
  ],
  diagnostico: [
    "As folhas do meu milho estão amarelando de baixo para cima. O que pode ser?",
    "Apareceram manchas marrons nas folhas da soja. Como descobrir a causa?",
    "Meu tomateiro está murchando durante o dia. O que devo verificar?",
  ],
  agricultura: [
    "Como fazer a calagem corretamente?",
    "Quando devo fazer a adubação de cobertura no milho?",
    "Como escolher a cultivar de soja para minha região?",
  ],
  clima: [
    "Vai gear nos próximos dias na minha propriedade?",
    "A previsão está boa para pulverizar esta semana?",
    "Como a chuva prevista afeta minha colheita?",
  ],
  pecuaria: [
    "Como melhorar o ganho de peso do gado no período seco?",
    "Quais cuidados de biosseguridade devo ter na granja de suínos?",
    "Como reduzir o estresse térmico das vacas leiteiras?",
  ],
  produtividade: [
    "Minha produtividade de soja caiu. Por onde começo a investigar?",
    "Como melhorar a fertilidade do solo de forma econômica?",
    "Vale a pena fazer integração lavoura-pecuária na minha propriedade?",
  ],
};

export type PropertyRow = {
  id: string;
  user_id: string;
  name: string;
  municipality: string;
  state: string;
  latitude: number | null;
  longitude: number | null;
  area_hectares: number | null;
  activity: "agricultura" | "pecuaria" | "mista";
  production_system: string | null;
  crops: string[];
  animals: { species: string; quantity: number | null }[];
  notes: string | null;
  share_with_ai: boolean;
  consent_updated_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Attachment = { path: string; mediaType: "image/jpeg" | "image/png" | "image/webp" };

export type Source = {
  kind: "web" | "knowledge_base";
  title: string;
  url: string | null;
  institution?: string | null;
  cited?: boolean;
};

export type MessageRow = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  attachments: Attachment[];
  sources: Source[];
  input_mode: "text" | "voice";
  status: "complete" | "refused" | "error";
  created_at: string;
};

export type ConversationRow = {
  id: string;
  title: string;
  topic: Topic;
  created_at: string;
  updated_at: string;
};
