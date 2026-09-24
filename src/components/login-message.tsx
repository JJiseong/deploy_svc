"use client";

import { useSearchParams } from "next/navigation";

const messages: Record<string, string> = {
  AccessDenied: "Access is not enabled for this GitHub account. Contact an administrator.",
  Configuration: "GitHub sign-in is unavailable. Try again.",
  OAuthSignin: "GitHub sign-in is unavailable. Try again.",
  OAuthCallback: "GitHub sign-in is unavailable. Try again.",
  Callback: "GitHub sign-in is unavailable. Try again.",
};

export function LoginMessage() {
  const error = useSearchParams().get("error");
  if (!error) return null;
  return <div className="alert error" role="alert"><p>{messages[error] ?? "GitHub sign-in is unavailable. Try again."}</p><a className="button secondary" href="/login">Try again</a></div>;
}
