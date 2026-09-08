export const hosted = () =>
  Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
export const localMode = () =>
  process.env.WORKSHOP_LOCAL_MODE === "true" &&
  !process.env.VERCEL &&
  process.env.NODE_ENV !== "production";
export const fixtureAI = () =>
  localMode() && process.env.WORKSHOP_TEST_AI === "true";
export function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing service configuration: ${name}`);
  return v;
}

export const inviteOnly = () => process.env.WORKSHOP_INVITE_ONLY === "true";
