import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await getAuthContext();
  if (!user) redirect("/entrar");
  return <AppShell userEmail={user.email ?? ""}>{children}</AppShell>;
}
