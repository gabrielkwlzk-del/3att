import type { Metadata } from "next";
import { getAuthContext } from "@/lib/supabase/server";
import { getProperty } from "@/lib/data";
import { getPublicCapabilities } from "@/lib/env";
import { isTopic } from "@/lib/domain";
import { ChatView } from "@/components/chat/chat-view";

export const metadata: Metadata = { title: "Nova conversa" };

export default async function NewChatPage({ searchParams }: PageProps<"/chat">) {
  const params = await searchParams;
  const topicParam = typeof params.topico === "string" ? params.topico : undefined;
  const topic = isTopic(topicParam) ? topicParam : "geral";
  const q = typeof params.q === "string" ? params.q.slice(0, 1000) : undefined;

  const { supabase, user } = await getAuthContext();
  const property = await getProperty(supabase, user!.id);

  return (
    <ChatView
      key={`${topic}:${q ?? ""}`}
      userId={user!.id}
      conversationId={null}
      topic={topic}
      initialMessages={[]}
      capabilities={getPublicCapabilities()}
      initialPrompt={q}
      hasProperty={Boolean(property)}
    />
  );
}
