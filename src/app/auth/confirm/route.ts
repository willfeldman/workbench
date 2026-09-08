import { NextResponse } from "next/server";
import { authClient } from "@/lib/server/supabase";
export async function GET(req: Request) {
  const url = new URL(req.url),
    hash = url.searchParams.get("token_hash"),
    type = url.searchParams.get("type");
  if (hash && (type === "invite" || type === "email" || type === "magiclink")) {
    const { error } = await (
      await authClient()
    ).auth.verifyOtp({ token_hash: hash, type });
    if (!error)
      return NextResponse.redirect(
        new URL("/", process.env.NEXT_PUBLIC_APP_URL || url.origin),
      );
  }
  return NextResponse.redirect(new URL("/login?error=expired", url.origin));
}
