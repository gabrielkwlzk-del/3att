import { z } from "zod";
import { getAuthContext } from "@/lib/supabase/server";
import { loadFields, loadSeasons } from "@/lib/farm/data";
import { buildReportData } from "@/lib/farm/report";
import { toCsv } from "@/lib/farm/csv";
import { HARVEST_UNITS } from "@/lib/farm/units";
import { formatDateBR } from "@/lib/farm/format";

const Query = z.object({ safra: z.string().uuid(), tipo: z.enum(["resumo", "lancamentos", "colheitas", "operacoes"]) });
const reais = (cents: number) => cents / 100;

/** Exporta dados da safra em CSV (Excel pt-BR). Só entrega dados do próprio usuário (RLS). */
export async function GET(request: Request) {
  const { supabase, user } = await getAuthContext();
  if (!user) return Response.json({ error: "Faça login para continuar." }, { status: 401 });
  const parsed = Query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return Response.json({ error: "Pedido inválido." }, { status: 400 });

  const [seasons, fields] = await Promise.all([loadSeasons(supabase), loadFields(supabase)]);
  const season = seasons.find((s) => s.id === parsed.data.safra);
  if (!season) return Response.json({ error: "Safra não encontrada." }, { status: 404 });
  const d = await buildReportData(supabase, season, seasons, fields);

  let rows: (string | number | null)[][];
  switch (parsed.data.tipo) {
    case "resumo": {
      const r = d.row;
      rows = [
        ["Indicador", "Valor"],
        ["Safra", season.name],
        ["Receita (R$)", reais(r.summary.receita)],
        ["Despesas (R$)", reais(r.summary.despesa)],
        ["Investimentos (R$)", reais(r.summary.investimento)],
        ["Resultado (R$)", reais(r.summary.resultado)],
        ["Margem de lucro (%)", r.summary.margemPct != null ? Number(r.summary.margemPct.toFixed(2)) : null],
        ["Custo por hectare (R$)", r.custoPorHa != null ? reais(r.custoPorHa) : null],
        ["Produtividade média (sc/ha)", r.scPorHa != null ? Number(r.scPorHa.toFixed(2)) : null],
        ["Custo por saca (R$)", r.custoPorSaca != null ? reais(r.custoPorSaca) : null],
        [],
        ["Despesas por categoria", "R$"],
        ...d.categories.map((c) => [c.category, reais(c.cents)]),
        [],
        ["Talhão", "Cultura", "Área (ha)", "kg/ha", "sc/ha"],
        ...d.productivity.map((x) => [x.name, x.crop, x.areaHectares, Math.round(x.kgHa), Number(x.scHa.toFixed(1))]),
      ];
      break;
    }
    case "lancamentos":
      rows = [["Data", "Tipo", "Categoria", "Descrição", "Talhão", "Valor (R$)"], ...d.transactions.map((t) => [formatDateBR(t.occurredOn), t.kind, t.category, t.description, t.field, reais(t.amountCents)])];
      break;
    case "colheitas":
      rows = [["Data", "Talhão", "Cultura", "Quantidade", "Unidade"], ...d.harvests.map((h) => [formatDateBR(h.harvestedOn), h.field, h.crop, h.amount, HARVEST_UNITS.find((u) => u.value === h.unit)?.label ?? h.unit])];
      break;
    default:
      rows = [["Data", "Talhão", "Produto", "Dose", "Alvo", "Carência (dias)"], ...d.operations.applications.map((a) => [formatDateBR(a.date), a.field, a.product, a.dose, a.target, a.withdrawalDays])];
  }

  const safeName = season.name.normalize("NFD").replace(/[^\w-]+/g, "_").replace(/_+/g, "_");
  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="agroia-${parsed.data.tipo}-${safeName}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
