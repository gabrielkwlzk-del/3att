import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Recebe o link de acesso / confirmação enviado por e-mail (fluxo PKCE). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(safeNext, url.origin));
  }
  return NextResponse.redirect(new URL("/entrar?erro=link", url.origin));
}
