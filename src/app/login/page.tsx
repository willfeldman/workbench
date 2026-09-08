import LoginForm from "@/components/login-form";
import { hosted, inviteOnly } from "@/lib/server/config";
export const dynamic = "force-dynamic";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <LoginForm
      configured={hosted()}
      invitationRequired={inviteOnly()}
      initialError={
        error === "expired"
          ? "That sign-in link has expired or was already used. Request a new one below."
          : ""
      }
    />
  );
}
