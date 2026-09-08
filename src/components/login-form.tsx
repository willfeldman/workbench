"use client";
import { WorkbenchLogo } from "@/components/workbench-logo";
import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Button } from "@/components/ui/button";
export default function LoginForm({
  invitationRequired,
  configured,
  initialError = "",
}: {
  invitationRequired: boolean;
  configured: boolean;
  initialError?: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(initialError);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !configured) return;
    setBusy(true);
    setError("");
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
        key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
      if (!url || !key)
        throw new Error("Sign-in is being set up. Please check back shortly.");
      const { error } = await createBrowserClient(url, key).auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: location.origin + "/auth/callback",
        },
      });
      if (error) throw error;
    } catch {
      setError("We couldn’t start Google sign-in. Please try again.");
      setBusy(false);
    }
  }
  return (
    <main className="login">
      <a href="/" className="wordmark">
        Workbench
      </a>
      <div className="login-card">
        <WorkbenchLogo />
        <h1>Welcome to Workbench</h1>
        <p>A little help making something of your own.</p>
        {!configured && (
          <p role="status">
            Sign-in is being set up. Please check back shortly.
          </p>
        )}
        <form onSubmit={submit} aria-busy={busy}>
          <Button disabled={busy || !configured}>
            {busy ? "Opening Google…" : "Continue with Google"}
          </Button>
        </form>
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        <a href="/demo" className="quiet-link">
          Explore an example
        </a>
      </div>
      <span className="login-footer">
        {invitationRequired ? "By invitation" : "Your projects are private"}
      </span>
    </main>
  );
}
