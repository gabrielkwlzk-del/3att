import {
  Cog,
  Droplets,
  FileText,
  FlaskConical,
  MapPinned,
  Package,
  ClipboardCheck,
  TrendingUp,
  ChartLine,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type FarmModule = {
  key: string;
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Classes de cor do ícone no hub (claro e escuro) */
  tone: string;
};

/** Módulos da gestão da propriedade. A ordem é a do hub e do menu lateral. */
export const FARM_MODULES: FarmModule[] = [
  { key: "talhoes", href: "/gestao/talhoes", label: "Talhões e safras", description: "Áreas, safras e colheitas", icon: MapPinned, tone: "bg-[#e7f3ea] text-[#1f6b3a] dark:bg-[#173022] dark:text-[#7fcf98]" },
  { key: "financeiro", href: "/gestao/financeiro", label: "Financeiro", description: "Despesas, receitas, margem e custo por hectare", icon: Wallet, tone: "bg-[#e8f0fa] text-[#1d5fa8] dark:bg-[#132538] dark:text-[#7cb4f5]" },
  { key: "estoque", href: "/gestao/estoque", label: "Estoque de insumos", description: "Lotes, validade, mínimos e custos", icon: Package, tone: "bg-[#f6ecd6] text-[#8a6114] dark:bg-[#2b2416] dark:text-[#d9ab55]" },
  { key: "maquinas", href: "/gestao/maquinas", label: "Máquinas", description: "Horas, combustível e manutenção", icon: Cog, tone: "bg-[#f8e8df] text-[#9c4a24] dark:bg-[#33201a] dark:text-[#e08a5f]" },
  { key: "irrigacao", href: "/gestao/irrigacao", label: "Irrigação", description: "Registros e necessidade de água", icon: Droplets, tone: "bg-[#e3f3f6] text-[#14677a] dark:bg-[#12303a] dark:text-[#6fd0e6]" },
  { key: "tarefas", href: "/gestao/tarefas", label: "Tarefas e operações", description: "Plantio, aplicações, inspeções e colheitas", icon: ClipboardCheck, tone: "bg-[#ecebf8] text-[#4b44a3] dark:bg-[#1f1d38] dark:text-[#a7a2f0]" },
  { key: "solo", href: "/gestao/solo", label: "Análise de solo", description: "Laudos em PDF interpretados pela IA", icon: FlaskConical, tone: "bg-[#f3e8f4] text-[#7a3a85] dark:bg-[#2b1a30] dark:text-[#d79be3]" },
  { key: "produtividade", href: "/gestao/produtividade", label: "Previsão de produtividade", description: "Estimativa com faixa de incerteza", icon: TrendingUp, tone: "bg-[#e7f3ea] text-[#1f6b3a] dark:bg-[#173022] dark:text-[#7fcf98]" },
  { key: "mercado", href: "/gestao/mercado", label: "Mercado e cotações", description: "Preços, histórico e alertas", icon: ChartLine, tone: "bg-[#fdecea] text-[#b42318] dark:bg-[#3a1714] dark:text-[#f97066]" },
  { key: "relatorios", href: "/gestao/relatorios", label: "Relatórios", description: "Resumo da safra com IA e exportação", icon: FileText, tone: "bg-[#eeeadf] text-[#5b685f] dark:bg-[#1f3025] dark:text-[#a0b1a5]" },
];
