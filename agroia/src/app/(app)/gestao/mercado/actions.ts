"use server";

import { z } from "zod";
import type { ActionState } from "@/lib/farm/action-state";
import { COMMODITIES } from "@/lib/farm/market";
import { parseCsv } from "@/lib/farm/csv";
import { isIsoDate, parseDecimalBR, todayBR } from "@/lib/farm/format";
import { dbMessage, done, fail, requireCtx, text, zDate, zNumber, zOptText, zUuid, zodFieldErrors } from "@/lib/farm/server";

const PATHS = ["/gestao", "/gestao/mercado"];
const COMMODITY_KEYS = COMMODITIES.map((c) => c.value) as [string, ...string[]];

const zUrl = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : v),
  z.string().trim().max(500).refine((u) => /^https?:\/\/[^\s]+$/i.test(u), "Informe um link começando com http:// ou https://").nullable(),
);

const QuoteSchema = z.object({
  commodity: z.enum(COMMODITY_KEYS, { message: "Escolha a mercadoria." }),
  price: zNumber(0.0001, 1_000_000, "Informe o preço. Ex.: 128,50"),
  unit: z.string().trim().min(1, "Informe a unidade.").max(20, "Máximo de 20 caracteres."),
  quoted_on: zDate.refine((d) => d <= todayBR(), "A data não pode ser futura."),
  source: z.string().trim().min(1, "Informe a fonte da cotação. Ex.: CEPEA/ESALQ").max(120),
  source_url: zUrl,
  region: zOptText(80),
});

export async function createQuote(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, user } = await requireCtx();
  const parsed = QuoteSchema.safeParse({
    commodity: text(fd, "commodity"), price: text(fd, "price"), unit: text(fd, "unit"), quoted_on: text(fd, "quoted_on"),
    source: text(fd, "source"), source_url: text(fd, "source_url"), region: text(fd, "region"),
  });
  if (!parsed.success) return fail("Revise os campos destacados.", zodFieldErrors(parsed.error));
  const { error } = await supabase.from("market_quotes").insert({ user_id: user.id, ...parsed.data });
  if (error) return fail(dbMessage(error));
  return done("Cotação salva.", PATHS);
}

const ImportSchema = z.object({
  commodity: z.enum(COMMODITY_KEYS, { message: "Escolha a mercadoria." }),
  unit: z.string().trim().min(1, "Informe a unidade.").max(20),
  source: z.string().trim().min(1, "Informe a fonte dos dados.").max(120),
  source_url: zUrl,
  region: zOptText(80),
  data: z.string().trim().min(1, "Cole as linhas (data e preço).").max(200_000),
});

/** "2026-11-05", "05/11/2026" ou "05/11/26" → AAAA-MM-DD */
function parseDateCell(raw: string): string | null {
  const s = raw.trim();
  if (isIsoDate(s)) return s;
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (!m) return null;
  const year = m[3].length === 2 ? `20${m[3]}` : m[3];
  const iso = `${year}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return isIsoDate(iso) ? iso : null;
}

export async function importQuotes(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, user } = await requireCtx();
  const parsed = ImportSchema.safeParse({
    commodity: text(fd, "commodity"), unit: text(fd, "unit"), source: text(fd, "source"), source_url: text(fd, "source_url"), region: text(fd, "region"), data: String(fd.get("data") ?? ""),
  });
  if (!parsed.success) return fail("Revise os campos destacados.", zodFieldErrors(parsed.error));
  const { data: raw, ...meta } = parsed.data;

  const today = todayBR();
  const rows = new Map<string, Record<string, unknown>>();
  let skipped = 0;
  for (const cells of parseCsv(raw)) {
    const date = parseDateCell(cells[0] ?? "");
    const price = parseDecimalBR(cells[1] ?? "");
    if (!date) {
      // cabeçalho (ex.: "data;preço") não conta como erro
      if (!/^[a-zA-ZçÇãÃ]/.test(cells[0] ?? "")) skipped += 1;
      continue;
    }
    if (price == null || price <= 0 || date > today) {
      skipped += 1;
      continue;
    }
    rows.set(date, { user_id: user.id, commodity: meta.commodity, price, unit: meta.unit, quoted_on: date, source: meta.source, source_url: meta.source_url, region: meta.region });
  }
  if (rows.size === 0) return fail("Nenhuma linha válida. Use uma linha por dia: data e preço (ex.: 05/11/2026;128,50).");
  if (rows.size > 1000) return fail("Importe no máximo 1.000 linhas por vez.");

  const { error } = await supabase.from("market_quotes").upsert([...rows.values()], { onConflict: "user_id,commodity,quoted_on,source" });
  if (error) return fail(dbMessage(error));
  return done(`${rows.size} cotações importadas${skipped ? ` (${skipped} linha(s) ignorada(s))` : ""}.`, PATHS);
}

export async function deleteQuote(fd: FormData): Promise<void> {
  const { supabase } = await requireCtx();
  const id = zUuid.safeParse(text(fd, "id"));
  if (!id.success) return;
  const { error } = await supabase.from("market_quotes").delete().eq("id", id.data);
  if (error) throw new Error(dbMessage(error));
  done("", PATHS);
}

const AlertSchema = z.object({
  commodity: z.enum(COMMODITY_KEYS, { message: "Escolha a mercadoria." }),
  kind: z.enum(["acima", "abaixo", "variacao"], { message: "Escolha o tipo de alerta." }),
  threshold: zNumber(0.0001, 1_000_000, "Informe o valor."),
});

export async function createAlert(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, user } = await requireCtx();
  const parsed = AlertSchema.safeParse({ commodity: text(fd, "commodity"), kind: text(fd, "kind"), threshold: text(fd, "threshold") });
  if (!parsed.success) return fail("Revise os campos destacados.", zodFieldErrors(parsed.error));
  const { count } = await supabase.from("market_alerts").select("id", { count: "exact", head: true });
  if ((count ?? 0) >= 50) return fail("Limite de 50 alertas atingido.");
  const { error } = await supabase.from("market_alerts").insert({ user_id: user.id, ...parsed.data });
  if (error) return fail(dbMessage(error));
  return done("Alerta criado.", PATHS);
}

export async function toggleAlert(fd: FormData): Promise<void> {
  const { supabase } = await requireCtx();
  const id = zUuid.safeParse(text(fd, "id"));
  if (!id.success) return;
  const { error } = await supabase.from("market_alerts").update({ active: text(fd, "active") === "1" }).eq("id", id.data);
  if (error) throw new Error(dbMessage(error));
  done("", PATHS);
}

export async function deleteAlert(fd: FormData): Promise<void> {
  const { supabase } = await requireCtx();
  const id = zUuid.safeParse(text(fd, "id"));
  if (!id.success) return;
  const { error } = await supabase.from("market_alerts").delete().eq("id", id.data);
  if (error) throw new Error(dbMessage(error));
  done("", PATHS);
}
