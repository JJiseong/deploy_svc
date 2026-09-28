"use client";
import { useState } from "react";
import { changePassword } from "../../actions/account";

export default function ChangePasswordPage() {
  const [message, setMessage] = useState(""); const [pending, setPending] = useState(false);
  return <main className="center-page"><section className="card narrow"><p className="eyebrow">보안 설정</p><h1>새 비밀번호를 설정하세요</h1><p className="muted">임시 비밀번호는 한 번만 사용할 수 있습니다.</p><form className="login-form" onSubmit={async (event) => { event.preventDefault(); setPending(true); const form = new FormData(event.currentTarget); const result = await changePassword({ currentPassword: form.get("currentPassword"), newPassword: form.get("newPassword") }); setPending(false); if (result.ok) window.location.assign("/dashboard"); else setMessage(result.message); }}><label>현재 비밀번호<input name="currentPassword" type="password" required /></label><label>새 비밀번호<input name="newPassword" type="password" minLength={12} required /></label>{message && <p role="alert" className="field-error">{message}</p>}<button className="button primary" disabled={pending}>비밀번호 변경</button></form></section></main>;
}
