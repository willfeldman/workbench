import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !process.env[line.slice(0, i)])
    process.env[line.slice(0, i)] = line.slice(i + 1);
}
async function main() {
  const email = process.argv[2];
  if (!email || !email.includes("@"))
    throw new Error(
      "Usage: node --import tsx scripts/invite.ts email@example.com",
    );
  const c = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { data, error } = await c.auth.admin.inviteUserByEmail(email, {
    redirectTo: process.env.NEXT_PUBLIC_APP_URL + "/auth/callback",
  });
  if (error) throw error;
  const { error: memberError } = await c
    .from("beta_members")
    .upsert({ user_id: data.user.id });
  if (memberError) throw memberError;
  console.log("Invitation sent and beta access enabled.");
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
