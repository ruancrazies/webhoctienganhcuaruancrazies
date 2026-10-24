import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { requireEnv } from "../env";

/**
 * Client Supabase gắn với cookie phiên của request hiện tại (dùng anon key, tuân theo RLS).
 * Dùng trong Server Component / Server Action / Route Handler.
 */
export async function createSupabaseServer() {
  const store = await cookies();
  return createServerClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Server Component không ghi được cookie; proxy.ts đã làm mới phiên nên bỏ qua.
        }
      },
    },
  });
}
