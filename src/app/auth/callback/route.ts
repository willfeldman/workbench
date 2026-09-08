import { NextResponse } from "next/server";
import { authClient } from "@/lib/server/supabase";
export async function GET(req: Request) {
  const url = new URL(req.url),
    code = url.searchParams.get("code");
  if (code) {
    const { error } = await (
      await authClient()
    ).auth.exchangeCodeForSession(code);
    if (!error)
      return NextResponse.redirect(
        new URL("/", process.env.NEXT_PUBLIC_APP_URL || url.origin),
      );
  }
  return NextResponse.redirect(new URL("/login?error=expired", url.origin));
}
