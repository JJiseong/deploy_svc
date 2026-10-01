"use client";
import { useState } from "react";
import { addMember, changeMemberRole, changeMemberStatus, issueTemporaryPassword, makeExistingAppsPublic } from "../app/actions/admin";

type Member = { id: string; email: string | null; role: "ADMIN" | "USER"; status: "ACTIVE" | "INACTIVE"; lastLoginAt: string | null; createdAt: string };
export function GrantForm() {
  const [email, setEmail] = useState(""); const [role, setRole] = useState<"USER" | "ADMIN">("USER"); const [message, setMessage] = useState(""); const [pending, setPending] = useState(false);
  return <form className="card inline-form" onSubmit={async (event) => { event.preventDefault(); setPending(true); const result = await addMember({ email, role }); setPending(false); if (!result.ok) { setMessage(result.error.message); return; } setEmail(""); setMessage(`계정을 만들었습니다. 임시 비밀번호: ${result.data.temporaryPassword} — 지금 복사해 전달하세요. 다시 볼 수 없습니다.`); }}><div><h2>팀원 초대</h2><p className="muted">임시 비밀번호는 한 번만 표시됩니다. 팀원은 첫 로그인에서 새 비밀번호를 정합니다.</p></div><label>이메일<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>역할<select value={role} onChange={(event) => setRole(event.target.value as "USER" | "ADMIN")}><option value="USER">사용자</option><option value="ADMIN">관리자</option></select></label><button className="button primary" disabled={pending}>{pending ? "계정 생성 중…" : "계정 만들기"}</button>{message && <p role="status" className="row-message">{message}</p>}</form>;
}

export function PublicMigrationPanel() {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  return <section className="card" aria-labelledby="public-migration-heading">
    <h2 id="public-migration-heading">기존 서비스 공개 전환</h2>
    <p className="muted">기존 배포에서 로그인 보호를 제거하고 공개 HTTPS 링크와 검색 비노출 설정을 적용합니다. 이미 전환된 서비스는 건너뛰어 안전하게 다시 실행할 수 있습니다.</p>
    <button className="button secondary" type="button" disabled={pending} onClick={async () => { setPending(true); setMessage(""); const result = await makeExistingAppsPublic(); setPending(false); if (!result.ok) { setMessage(result.error.message); return; } const failed = result.data.filter((item) => !item.ok).length; setMessage(failed ? `${result.data.length - failed}개 서비스 전환 완료, ${failed}개 서비스는 실패했습니다. 감사 로그에서 상세 결과를 확인하세요.` : `${result.data.length}개 서비스의 공개 전환이 완료되었습니다.`); }}>{pending ? "전환 확인 중…" : "기존 서비스 공개 전환"}</button>
    {message && <p className="row-message" role="status" aria-live="polite">{message}</p>}
  </section>;
}

export function GrantRow({ grant }: { grant: Member }) {
  const [role, setRole] = useState(grant.role); const [message, setMessage] = useState(""); const [pending, setPending] = useState(false);
  async function run(action: () => Promise<{ ok: boolean; data?: unknown; error?: { message: string } }>) { setPending(true); const result = await action(); setPending(false); const password = typeof result.data === "object" && result.data && "temporaryPassword" in result.data ? String((result.data as { temporaryPassword: string }).temporaryPassword) : ""; setMessage(result.ok ? password ? `새 임시 비밀번호: ${password} — 지금 복사해 전달하세요.` : "저장했습니다." : result.error?.message ?? "처리하지 못했습니다."); }
  return <article className="grant-row" aria-busy={pending}><div><strong>{grant.email ?? "기존 계정 (이메일 설정 필요)"}</strong><small>{grant.lastLoginAt ? `마지막 로그인 ${new Date(grant.lastLoginAt).toLocaleString("ko-KR")}` : "로그인 기록 없음"}</small></div><select aria-label={`${grant.email ?? "계정"} 역할`} value={role} onChange={(event) => setRole(event.target.value as "USER" | "ADMIN")}><option value="USER">사용자</option><option value="ADMIN">관리자</option></select><span className={`status-badge status-${grant.status.toLowerCase()}`}>{grant.status === "ACTIVE" ? "활성" : "비활성"}</span><button className="button secondary" type="button" onClick={() => void run(() => changeMemberRole(grant.id, role))}>역할 저장</button><button className="button text" type="button" onClick={() => void run(() => issueTemporaryPassword(grant.id))}>임시 비밀번호 재발급</button><button className="button text" type="button" onClick={() => void run(() => changeMemberStatus(grant.id, grant.status === "ACTIVE" ? "INACTIVE" : "ACTIVE"))}>{grant.status === "ACTIVE" ? "비활성화" : "다시 활성화"}</button>{message && <small role="status" className="row-message">{message}</small>}</article>;
}
