import type { TxKind } from "./finance";

export const TX_KINDS: { value: TxKind; label: string }[] = [
  { value: "despesa", label: "Despesa" },
  { value: "receita", label: "Receita" },
  { value: "investimento", label: "Investimento" },
];

export const TX_CATEGORIES: Record<TxKind, string[]> = {
  despesa: ["Sementes", "Fertilizantes", "Defensivos", "Corretivos (calcário, gesso)", "Combustível", "Mão de obra", "Manutenção de máquinas", "Arrendamento", "Energia", "Irrigação", "Frete", "Seguro", "Impostos e taxas", "Ração e suplementos", "Sanidade animal", "Outros"],
  receita: ["Venda de grãos", "Venda de animais", "Venda de leite", "Venda de hortaliças e frutas", "Serviços", "Outros"],
  investimento: ["Máquinas e implementos", "Benfeitorias", "Irrigação", "Correção e construção de solo", "Terra", "Outros"],
};

export const ALL_CATEGORIES = Array.from(new Set(Object.values(TX_CATEGORIES).flat()));

export const INVENTORY_CATEGORIES: { value: string; label: string; txCategory: string }[] = [
  { value: "semente", label: "Sementes", txCategory: "Sementes" },
  { value: "fertilizante", label: "Fertilizantes", txCategory: "Fertilizantes" },
  { value: "defensivo", label: "Defensivos", txCategory: "Defensivos" },
  { value: "corretivo", label: "Corretivos", txCategory: "Corretivos (calcário, gesso)" },
  { value: "combustivel", label: "Combustíveis", txCategory: "Combustível" },
  { value: "outros", label: "Outros", txCategory: "Outros" },
];
