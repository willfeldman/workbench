import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { HttpError } from "./supabase";
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (
    origin &&
    origin !== new URL(req.url).origin &&
    origin !== process.env.NEXT_PUBLIC_APP_URL
  )
    throw new HttpError(403, "Request origin is not allowed.");
}
export function errorResponse(e: unknown) {
  if (e instanceof HttpError)
    return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof ZodError)
    return NextResponse.json(
      { error: "Please check the supplied information." },
      { status: 400 },
    );
  console.error(
    "Workbench request failed",
    e instanceof Error ? e.message : "Unknown error",
  );
  return NextResponse.json(
    {
      error: "That didn’t work. Your saved project is safe. Please try again.",
    },
    { status: 500 },
  );
}
