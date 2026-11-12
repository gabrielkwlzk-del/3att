import type { Metadata } from "next";
import Link from "next/link";
import { MessageSquarePlus } from "lucide-react";
import { getAuthContext } from "@/lib/supabase/server";
import type { ConversationRow } from "@/lib/domain";
import { ConversationList } from "@/components/conversation-list";

export const metadata: Metadata = { title: "Conversas" };

export default async function ConversationsPage() {
  const { supabase } = await getAuthContext();
  const { data } = await supabase
    .from("conversations")
    .select("id, title, topic, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(100);
  const conversations = (data ?? []) as ConversationRow[];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-6 pb-10 sm:px-6 sm:pt-10">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Conversas</h1>
          <p className="text-sm text-muted">Seu histórico fica salvo apenas na sua conta.</p>
        </div>
        <Link
          href="/chat"
          className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-brand px-4 text-sm font-medium text-brand-fg transition hover:bg-brand-strong active:scale-[0.98]"
        >
          <MessageSquarePlus className="size-4" aria-hidden /> Nova
        </Link>
      </div>
      <ConversationList initial={conversations} />
    </div>
  );
}
