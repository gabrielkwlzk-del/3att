import { z } from "zod";
import { getAuthContext } from "@/lib/supabase/server";

const PatchSchema = z.object({ title: z.string().trim().min(1).max(120) });

/** Renomeia uma conversa do próprio usuário. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/conversations/[id]">) {
  const { id } = await ctx.params;
  const { supabase, user } = await getAuthContext();
  if (!user) return Response.json({ error: "Faça login para continuar." }, { status: 401 });
  const parsed = PatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !z.string().uuid().safeParse(id).success) {
    return Response.json({ error: "Pedido inválido." }, { status: 400 });
  }
  const { error } = await supabase.from("conversations").update({ title: parsed.data.title }).eq("id", id);
  if (error) return Response.json({ error: "Não foi possível renomear." }, { status: 500 });
  return Response.json({ ok: true });
}

/** Exclui a conversa, as mensagens (cascata) e as fotos anexadas. */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/conversations/[id]">) {
  const { id } = await ctx.params;
  const { supabase, user } = await getAuthContext();
  if (!user) return Response.json({ error: "Faça login para continuar." }, { status: 401 });
  if (!z.string().uuid().safeParse(id).success) return Response.json({ error: "Pedido inválido." }, { status: 400 });

  const { data: messages } = await supabase.from("messages").select("attachments").eq("conversation_id", id);
  const paths = (messages ?? [])
    .flatMap((m) => (m.attachments as { path: string }[]) ?? [])
    .map((a) => a.path)
    .filter((p) => p.startsWith(`${user.id}/`));

  const { error } = await supabase.from("conversations").delete().eq("id", id);
  if (error) return Response.json({ error: "Não foi possível excluir." }, { status: 500 });
  if (paths.length) await supabase.storage.from("plant-photos").remove(paths);
  return Response.json({ ok: true });
}
