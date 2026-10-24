import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "./env";

let admin: SupabaseClient | undefined;

/**
 * Client dùng khóa service_role: BỎ QUA RLS. Chỉ dùng trong mã server (ADR-1).
 * Không bao giờ import file này từ client component.
 */
export function createAdminClient(): SupabaseClient {
  admin ??= createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}
