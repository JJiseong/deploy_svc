import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "../../lib/db";
import { getCurrentUser } from "../../lib/auth/current-user";
import { AppShell } from "../../components/app-shell";
import { DeploymentForm } from "../../components/deployment-form";
import { StatusBadge } from "../../components/status-badge";
export const dynamic = "force-dynamic";
export default async function DashboardPage() { const user = await getCurrentUser(); if (!user) redirect("/login"); const deployments = await prisma.deployment.findMany({ where: user.role === "ADMIN" ? {} : { userId: user.id }, orderBy: { updatedAt: "desc" }, take: 20 }); return <AppShell user={user}><header className="page-header"><div><p className="eyebrow">작업 공간</p><h1>대시보드</h1></div></header><DeploymentForm /><section className="card" aria-labelledby="recent-deployments-heading"><h2 id="recent-deployments-heading">최근 배포</h2>{deployments.length === 0 ? <p className="empty">아직 배포가 없습니다. 위 양식에서 첫 배포를 만들어 보세요.</p> : <div className="deployment-list">{deployments.map((deployment) => <Link className="deployment-row" href={`/deployments/${deployment.id}`} key={deployment.id} aria-label={`${deployment.actualName ?? deployment.requestedName} 배포 보기`}><StatusBadge status={deployment.status} /><span><strong>{deployment.actualName ?? deployment.requestedName}</strong><small>{deployment.repository} · {deployment.branch}</small></span><time dateTime={deployment.updatedAt.toISOString()}>{deployment.updatedAt.toLocaleString("ko-KR")}</time><span aria-hidden="true">→</span></Link>)}</div>}</section></AppShell>; }
