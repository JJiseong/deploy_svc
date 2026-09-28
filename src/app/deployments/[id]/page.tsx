import Link from "next/link";
import { notFound } from "next/navigation";
import { redirect } from "next/navigation";
import { prisma } from "../../../lib/db";
import { getCurrentUser } from "../../../lib/auth/current-user";
import { AppShell } from "../../../components/app-shell";
import { StatusBadge } from "../../../components/status-badge";
import { DeploymentStatus } from "../../../components/deployment-status";
export const dynamic = "force-dynamic";
export default async function DeploymentPage({ params }: { params: Promise<{ id: string }> }) { const user = await getCurrentUser(); if (!user) redirect("/login"); if (user.mustChangePassword) redirect("/account/change-password"); const { id } = await params; const deployment = await prisma.deployment.findUnique({ where: { id } }); if (!deployment || (user.role !== "ADMIN" && deployment.userId !== user.id)) notFound(); return <AppShell user={user}><header className="page-header"><div><Link href="/dashboard" className="back-link">← 대시보드</Link><h1>{deployment.actualName ?? deployment.requestedName}</h1><p className="muted">{deployment.repository} · {deployment.branch}</p></div>{deployment.url && <a className="button primary" href={deployment.url} target="_blank" rel="noreferrer">서비스 열기</a>}</header><section className="card status-panel"><h2>배포 상태</h2><DeploymentStatus id={deployment.id} initial={{ status: deployment.status, url: deployment.url, failureSummary: deployment.failureSummary, lastUpdatedAt: deployment.updatedAt.toISOString() }} /><details><summary>배포 정보</summary><dl className="details"><div><dt>저장소</dt><dd>{deployment.repository}</dd></div><div><dt>버전</dt><dd>{deployment.branch}</dd></div><div><dt>배포 방식</dt><dd>{deployment.buildPack}</dd></div></dl></details></section></AppShell>; }
