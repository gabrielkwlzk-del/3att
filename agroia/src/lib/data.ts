import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PropertyRow } from "@/lib/domain";

export async function getProperty(supabase: SupabaseClient, userId: string): Promise<PropertyRow | null> {
  const { data } = await supabase.from("properties").select("*").eq("user_id", userId).maybeSingle();
  return (data as PropertyRow | null) ?? null;
}
