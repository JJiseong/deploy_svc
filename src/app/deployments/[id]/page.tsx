import Link from "next/link";
import { notFound } from "next/navigation";
import { redirect } from "next/navigation";
import { prisma } from "../../../lib/db";
import { getCurrentUser } from "../../../lib/auth/current-user";
import { AppShell } from "../../../components/app-shell";
import { StatusBadge } from "../../../components/status-badge";
import { DeploymentStatus } from "../../../components/deployment-status";
import { CredentialDisclosure } from "../../../components/credential-disclosure";
export const dynamic = "force-dynamic";
export default async function DeploymentPage({ params }: { params: Promise<{ id: string }> }) { const user = await getCurrentUser(); if (!user) redirect("/login"); const { id } = await params; const deployment = await prisma.deployment.findUnique({ where: { id } }); if (!deployment || (user.role !== "ADMIN" && deployment.userId !== user.id)) notFound(); return <AppShell user={user}><header className="page-header"><div><Link href="/dashboard" className="back-link">← Dashboard</Link><h1>{deployment.actualName ?? deployment.requestedName}</h1><p className="muted">{deployment.repository} · {deployment.branch}</p></div></header><section className="card status-panel"><h2>Status</h2><DeploymentStatus id={deployment.id} initial={{ status: deployment.status, url: deployment.url, failureSummary: deployment.failureSummary, lastUpdatedAt: deployment.updatedAt.toISOString() }} /><dl className="details"><div><dt>Repository</dt><dd>{deployment.repository}</dd></div><div><dt>Branch</dt><dd>{deployment.branch}</dd></div><div><dt>Build pack</dt><dd>{deployment.buildPack}</dd></div><div><dt>Port</dt><dd>{deployment.port}</dd></div></dl><CredentialDisclosure deploymentId={deployment.id} /></section></AppShell>; }
