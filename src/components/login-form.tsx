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
  const [email, setEmail] = useState(""),
    [sent, setSent] = useState(false),
    [busy, setBusy] = useState(false),
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
      const { error } = await createBrowserClient(url, key).auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: !invitationRequired,
          emailRedirectTo: location.origin + "/auth/callback",
        },
      });
      if (error) throw error;
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed.");
    } finally {
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
        <h1>{sent ? "Check your inbox" : "Welcome to Workbench"}</h1>
        <p>
          {sent
            ? "Follow the sign-in link to open your workspace."
            : "A little help making something of your own."}
        </p>
        {!configured && (
          <p role="status">
            Sign-in is being set up. Please check back shortly.
          </p>
        )}
        {!sent && (
          <form onSubmit={submit}>
            <input
              aria-label="Email address"
              type="email"
              autoComplete="email"
              required
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button disabled={busy || !configured}>
              {busy ? "Sending…" : "Continue with email"}
            </Button>
          </form>
        )}
        {sent && (
          <button
            className="quiet-link"
            onClick={() => {
              setSent(false);
              setError("");
            }}
          >
            Use a different email
          </button>
        )}
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
