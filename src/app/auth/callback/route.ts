import { NextResponse } from "next/server";
import { authClient } from "@/lib/server/supabase";
export async function GET(req: Request) {
  const url = new URL(req.url),
    code = url.searchParams.get("code");
  if (code && !url.searchParams.has("error")) {
    try {
      const { error } = await (
        await authClient()
      ).auth.exchangeCodeForSession(code);
      if (!error)
        return NextResponse.redirect(
          new URL("/", process.env.NEXT_PUBLIC_APP_URL || url.origin),
        );
    } catch {
      // Keep failed exchanges on the sign-in page without exposing provider details.
    }
  }
  return NextResponse.redirect(new URL("/login?error=signin_failed", url.origin));
}
