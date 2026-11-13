import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuthContext } from "@/lib/supabase/server";
import type { ActionState } from "./action-state";
import { isIsoDate, parseDecimalBR, parseMoneyToCents } from "./format";

export type Ctx = { supabase: SupabaseClient; user: User };

/** Usuário autenticado ou erro. Toda Server Action começa por aqui: o middleware não protege ações. */
export async function requireCtx(): Promise<Ctx> {
  const { supabase, user } = await getAuthContext();
  if (!user) throw new Error("Sessão expirada. Entre novamente.");
  return { supabase, user };
}

export const fail = (message: string, fieldErrors?: Record<string, string>): ActionState => ({ ok: false, message, fieldErrors });
export const done = (message: string, paths: string[] = []): ActionState => {
  for (const p of paths) revalidatePath(p);
  return { ok: true, message };
};

export function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) out[String(issue.path[0] ?? "form")] ??= issue.message;
  return out;
}

// ----- leitura de campos de formulário -----
export const text = (fd: FormData, name: string): string => String(fd.get(name) ?? "").trim();
export const optText = (fd: FormData, name: string): string | null => text(fd, name) || null;

/** Esquemas Zod reutilizáveis para valores digitados em português. */
export const zUuid = z.string().uuid("Seleção inválida.");
export const zOptUuid = z.preprocess((v) => (v === "" || v == null ? null : v), z.string().uuid("Seleção inválida.").nullable());
export const zDate = z.string().refine(isIsoDate, "Informe uma data válida.");
export const zOptDate = z.preprocess((v) => (v === "" || v == null ? null : v), z.string().refine(isIsoDate, "Informe uma data válida.").nullable());
export const zMoney = z
  .string()
  .transform((v, ctx) => {
    const c = parseMoneyToCents(v);
    if (c == null || c <= 0 || c >= 100_000_000_000) {
      ctx.addIssue({ code: "custom", message: "Informe um valor maior que zero. Ex.: 1.250,00" });
      return z.NEVER;
    }
    return c;
  });
export const zOptMoney = z.preprocess(
  (v) => (v === "" || v == null ? null : v),
  z.string().nullable().transform((v, ctx) => {
    if (v == null) return null;
    const c = parseMoneyToCents(v);
    if (c == null || c < 0) {
      ctx.addIssue({ code: "custom", message: "Valor inválido. Ex.: 12,50" });
      return z.NEVER;
    }
    return c;
  }),
);
export const zNumber = (min: number, max: number, message = "Número inválido.") =>
  z.string().transform((v, ctx) => {
    const n = parseDecimalBR(v);
    if (n == null || n < min || n > max) {
      ctx.addIssue({ code: "custom", message });
      return z.NEVER;
    }
    return n;
  });
export const zOptNumber = (min: number, max: number, message = "Número inválido.") =>
  z.preprocess(
    (v) => (v === "" || v == null ? null : v),
    z.string().nullable().transform((v, ctx) => {
      if (v == null) return null;
      const n = parseDecimalBR(v);
      if (n == null || n < min || n > max) {
        ctx.addIssue({ code: "custom", message });
        return z.NEVER;
      }
      return n;
    }),
  );
export const zOptText = (max: number) => z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().max(max, `Máximo de ${max} caracteres.`).nullable());

/** Converte erros do Postgres em mensagens amigáveis. */
export function dbMessage(error: { code?: string; message: string } | null): string {
  if (!error) return "";
  if (error.code === "23505") return "Já existe um registro com esse nome ou data.";
  if (error.code === "23514" && /insuficiente/i.test(error.message)) return "Estoque insuficiente para esta saída.";
  if (error.code === "23514") return "Algum valor está fora do permitido.";
  if (error.code === "42501") return "Você não tem permissão para esta operação.";
  if (error.code === "23503") return "Registro relacionado não encontrado.";
  return "Não foi possível salvar agora. Tente novamente.";
}
