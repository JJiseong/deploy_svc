import Link from "next/link";
import { redirect } from "next/navigation";
import type { AuditOutcome } from "@prisma/client";
import { prisma } from "../../../lib/db";
import { getCurrentUser } from "../../../lib/auth/current-user";
import { AppShell, ForbiddenPage } from "../../../components/app-shell";

export const dynamic = "force-dynamic";

const actionLabels: Record<string, string> = {
  AUTH_SIGN_IN: "로그인",
  AUTH_SIGN_OUT: "로그아웃",
  DEPLOYMENT_REQUESTED: "배포 요청",
  DEPLOYMENT_FAILURE: "배포 실패",
  DEPLOYMENT_RECONCILED: "배포 상태 조정",
  ACCESS_GRANT_CREATE: "접근 권한 추가",
  ACCESS_GRANT_ROLE: "접근 권한 역할 변경",
  ACCESS_GRANT_ACTIVATE: "접근 권한 활성화",
  ACCESS_GRANT_DEACTIVATE: "접근 권한 비활성화",
  CREDENTIAL_REVEAL: "인증정보 표시",
};

type Filters = { action?: string; outcome?: string; from?: string; to?: string; page?: string };

export default async function AuditLogsPage({ searchParams }: { searchParams: Promise<Filters> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") return <ForbiddenPage />;
  const filters = await searchParams;
  const page = Math.max(1, Number(filters.page ?? "1") || 1);
  const take = 25;
  const outcome = ["SUCCESS", "DENIED", "FAILURE"].includes(filters.outcome ?? "") ? filters.outcome as AuditOutcome : undefined;
  const from = filters.from && !Number.isNaN(Date.parse(filters.from)) ? new Date(`${filters.from}T00:00:00.000Z`) : undefined;
  const to = filters.to && !Number.isNaN(Date.parse(filters.to)) ? new Date(`${filters.to}T23:59:59.999Z`) : undefined;
  const where = {
    ...(filters.action ? { action: filters.action } : {}),
    ...(outcome ? { outcome } : {}),
    ...((from || to) ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
  };
  const [logs, total] = await prisma.$transaction(async (tx) => Promise.all([
    tx.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * take, take, include: { actor: { select: { githubLogin: true } } } }),
    tx.auditLog.count({ where }),
  ]));
  const pages = Math.max(1, Math.ceil(total / take));
  const href = (nextPage: number) => {
    const query = new URLSearchParams();
    if (filters.action) query.set("action", filters.action);
    if (filters.outcome) query.set("outcome", filters.outcome);
    if (filters.from) query.set("from", filters.from);
    if (filters.to) query.set("to", filters.to);
    query.set("page", String(nextPage));
    return `/admin/audit-logs?${query.toString()}`;
  };
  return <AppShell user={user}>
    <header className="page-header"><div><p className="eyebrow">관리</p><h1 tabIndex={-1}>감사 로그</h1><p className="muted">이 포털에서 발생한 활동 기록입니다. 민감한 값은 숨겨져 있습니다.</p></div></header>
    <section className="card" aria-labelledby="audit-results-heading">
      <h2 id="audit-results-heading" className="sr-only">감사 로그 결과</h2>
      <form className="filter-form" method="get">
        <label htmlFor="audit-action">작업<select id="audit-action" name="action" defaultValue={filters.action ?? ""}><option value="">모든 작업</option><option value="AUTH_SIGN_IN">로그인</option><option value="DEPLOYMENT_REQUESTED">배포 요청</option><option value="ACCESS_GRANT_CREATE">접근 권한 추가</option><option value="CREDENTIAL_REVEAL">인증정보 표시</option></select></label>
        <label htmlFor="audit-outcome">결과<select id="audit-outcome" name="outcome" defaultValue={filters.outcome ?? ""}><option value="">모든 결과</option><option value="SUCCESS">성공</option><option value="DENIED">거부됨</option><option value="FAILURE">실패</option></select></label>
        <label htmlFor="audit-from">시작일<input id="audit-from" name="from" type="date" defaultValue={filters.from ?? ""} /></label>
        <label htmlFor="audit-to">종료일<input id="audit-to" name="to" type="date" defaultValue={filters.to ?? ""} /></label>
        <button type="submit" className="button primary">필터 적용</button><Link className="button text" href="/admin/audit-logs">초기화</Link>
      </form>
      <div className="table-wrap"><table><caption className="sr-only">감사 이벤트</caption><thead><tr><th scope="col">시간</th><th scope="col">수행자</th><th scope="col">작업</th><th scope="col">결과</th><th scope="col">대상</th></tr></thead><tbody>{logs.map((log) => <tr key={log.id}><td data-label="시간"><time dateTime={log.createdAt.toISOString()}>{log.createdAt.toLocaleString("ko-KR")}</time></td><td data-label="수행자">{log.actor?.githubLogin ?? "시스템"}</td><td data-label="작업">{actionLabels[log.action] ?? log.action.replaceAll("_", " ")}</td><td data-label="결과"><span aria-hidden="true">{log.outcome === "SUCCESS" ? "✓" : log.outcome === "DENIED" ? "!" : "×"}</span> {log.outcome === "SUCCESS" ? "성공" : log.outcome === "DENIED" ? "거부됨" : "실패"}</td><td data-label="대상">{log.targetType ?? "—"}</td></tr>)}</tbody></table></div>
      {logs.length === 0 && <p className="empty">조건에 맞는 감사 이벤트가 없습니다. <Link href="/admin/audit-logs">필터 초기화</Link></p>}
      <nav className="pagination" aria-label="감사 로그 페이지"><span>{page} / {pages}페이지</span>{page > 1 ? <Link className="button secondary" href={href(page - 1)}>이전</Link> : <span className="button secondary disabled-link" aria-disabled="true">이전</span>}{page < pages ? <Link className="button secondary" href={href(page + 1)}>다음</Link> : <span className="button secondary disabled-link" aria-disabled="true">다음</span>}</nav>
    </section>
  </AppShell>;
}
