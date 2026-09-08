/** Read-only deployment readiness check. Load credentials with node --env-file=.env.local --import tsx. */
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

async function main() {
  const required = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "OPENAI_API_KEY",
    "NEXT_PUBLIC_APP_URL",
  ];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length)
    throw new Error(`Missing configuration: ${missing.join(", ")}`);
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  for (const table of ["project_records", "generation_usage", "events"]) {
    const { error } = await client
      .from(table)
      .select("*", { head: true, count: "exact" })
      .limit(0);
    if (error)
      throw new Error(
        `Database schema check failed for ${table}: ${error.code}`,
      );
    console.log(`Database ${table}: ready`);
  }
  const { data: bucket, error: bucketError } =
    await client.storage.getBucket("project-photos");
  if (bucketError || !bucket || bucket.public)
    throw new Error(
      "Private project photo storage is not configured correctly.",
    );
  console.log("Private photo storage: ready");
  const publicClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { data, error } = await publicClient
    .from("project_records")
    .select("id")
    .limit(1);
  if (!error && data?.length)
    throw new Error("Anonymous clients can read a private project.");
  console.log(
    "Anonymous project read: blocked or empty (verify two-account ownership separately)",
  );
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  await openai.models.retrieve(process.env.OPENAI_MODEL || "gpt-6-astra");
  console.log("Planning model: accessible");
  console.log(
    "Readiness checks passed. Google sign-in, two-account isolation and a full generation still require an end-to-end check.",
  );
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Readiness check failed",
  );
  process.exitCode = 1;
});
