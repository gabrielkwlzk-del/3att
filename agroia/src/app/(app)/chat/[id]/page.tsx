import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getAuthContext } from "@/lib/supabase/server";
import { getPublicCapabilities } from "@/lib/env";
import type { Attachment, ConversationRow, MessageRow } from "@/lib/domain";
import { ChatView } from "@/components/chat/chat-view";
import type { UIMessage } from "@/components/chat/message-item";

export const metadata: Metadata = { title: "Conversa" };

export default async function ConversationPage({ params }: PageProps<"/chat/[id]">) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();

  const { supabase, user } = await getAuthContext();
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, title, topic, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (!conversation) notFound();

  const [{ data: rows }, { count: propertyCount }] = await Promise.all([
    supabase
      .from("messages")
      .select("id, conversation_id, role, content, attachments, sources, input_mode, status, created_at")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true })
      .limit(200),
    supabase.from("properties").select("id", { count: "exact", head: true }),
  ]);
  const messages = (rows ?? []) as MessageRow[];

  // URLs temporárias (1 h) para exibir as fotos do bucket privado
  const paths = messages.flatMap((m) => (m.attachments as Attachment[]).map((a) => a.path));
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data } = await supabase.storage.from("plant-photos").createSignedUrls(paths, 3600);
    for (const item of data ?? []) if (item.path && item.signedUrl) signed.set(item.path, item.signedUrl);
  }

  const initialMessages: UIMessage[] = messages.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    attachments: (m.attachments as Attachment[]).map((a) => ({ path: a.path, url: signed.get(a.path) ?? null })),
    sources: m.sources ?? [],
    status: m.status,
    inputMode: m.input_mode,
    persisted: true,
  }));

  const conv = conversation as ConversationRow;
  return (
    <ChatView
      key={conv.id}
      userId={user!.id}
      conversationId={conv.id}
      topic={conv.topic}
      initialMessages={initialMessages}
      capabilities={getPublicCapabilities()}
      hasProperty={(propertyCount ?? 0) > 0}
    />
  );
}
