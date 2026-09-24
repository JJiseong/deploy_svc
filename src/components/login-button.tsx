"use client";
import { signIn } from "next-auth/react";
import { useState } from "react";

export function LoginButton() {
  const [pending, setPending] = useState(false);
  async function start() {
    setPending(true);
    try { await signIn("github", { callbackUrl: "/dashboard" }); }
    catch { setPending(false); }
  }
  return <button className="button primary" onClick={() => void start()} disabled={pending} aria-busy={pending}>{pending ? "Connecting to GitHub…" : "Continue with GitHub"}</button>;
}
