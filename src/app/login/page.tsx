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
      configured={hosted() && process.env.WORKSHOP_GOOGLE_LOGIN === "true"}
      invitationRequired={inviteOnly()}
      initialError={
        error
          ? "Sign-in wasn’t completed. Please try again."
          : ""
      }
    />
  );
}
