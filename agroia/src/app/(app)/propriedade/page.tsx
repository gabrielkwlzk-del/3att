import type { Metadata } from "next";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { getAuthContext } from "@/lib/supabase/server";
import { getProperty } from "@/lib/data";
import { PropertyForm } from "@/components/property/property-form";

export const metadata: Metadata = { title: "Minha propriedade" };

export default async function PropertyPage() {
  const { supabase, user } = await getAuthContext();
  const property = await getProperty(supabase, user!.id);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pt-6 pb-10 sm:px-6 sm:pt-10">
      <h1 className="text-2xl font-semibold tracking-tight">Minha propriedade</h1>
      <p className="mb-6 text-sm text-muted">
        Quanto mais a AgroIA souber sobre sua realidade, mais úteis ficam as respostas. Todos os campos podem ser
        alterados depois.
      </p>
      <PropertyForm property={property} />

      <section className="mt-10 border-t border-line pt-6 text-sm text-muted lg:hidden">
        <p>
          Conectado como <span className="font-medium text-fg">{user!.email}</span>
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <form action="/auth/sair" method="post">
            <button type="submit" className="inline-flex h-11 items-center gap-2 rounded-full border border-line px-4 font-medium text-fg">
              <LogOut className="size-4" aria-hidden /> Sair da conta
            </button>
          </form>
          <Link href="/privacidade" className="underline">Privacidade e dados</Link>
        </div>
      </section>
    </div>
  );
}
