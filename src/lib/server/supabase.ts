import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { requireEnv, localMode } from "./config";
export async function authClient() {
  const jar = await cookies();
  return createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    {
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (items) => {
          try {
            items.forEach(({ name, value, options }) =>
              jar.set(name, value, options),
            );
          } catch {
            /* Server components cannot set cookies. Route handlers refresh sessions. */
          }
        },
      },
    },
  );
}
export function adminClient() {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
export async function userId() {
  if (localMode()) return "00000000-0000-0000-0000-000000000001";
  const c = await authClient();
  const { data, error } = await c.auth.getUser();
  if (error || !data.user)
    throw new HttpError(401, "Please sign in to continue.");
  const { data: membership } = await adminClient()
    .from("beta_members")
    .select("user_id")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (!membership)
    throw new HttpError(403, "Workbench is currently invite-only.");
  return data.user.id;
}
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
