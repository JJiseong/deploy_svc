"use client";
import { signIn } from "next-auth/react";
import { useState } from "react";

export function LoginButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function start(form: FormData) {
    setPending(true);
    setError("");
    const result = await signIn("credentials", { email: String(form.get("email") ?? ""), password: String(form.get("password") ?? ""), redirect: false });
    if (result?.error) { setError("이메일 또는 비밀번호를 확인하세요."); setPending(false); return; }
    window.location.assign("/dashboard");
  }
  return <form action={(form) => void start(form)} className="login-form" aria-busy={pending}>
    <label htmlFor="email">이메일<input id="email" name="email" type="email" autoComplete="email" required /></label>
    <label htmlFor="password">비밀번호<input id="password" name="password" type="password" autoComplete="current-password" required /></label>
    {error && <p className="field-error" role="alert">{error}</p>}
    <button className="button primary" disabled={pending}>{pending ? "로그인하는 중…" : "로그인"}</button>
  </form>;
}
