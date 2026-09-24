import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "../../lib/db";
import { getCurrentUser } from "../../lib/auth/current-user";
import { AppShell } from "../../components/app-shell";
import { DeploymentForm } from "../../components/deployment-form";
import { StatusBadge } from "../../components/status-badge";
export const dynamic = "force-dynamic";
export default async function DashboardPage() { const user = await getCurrentUser(); if (!user) redirect("/login"); const deployments = await prisma.deployment.findMany({ where: user.role === "ADMIN" ? {} : { userId: user.id }, orderBy: { updatedAt: "desc" }, take: 20 }); return <AppShell user={user}><header className="page-header"><div><p className="eyebrow">Workspace</p><h1>Dashboard</h1></div></header><DeploymentForm /><section className="card" aria-labelledby="recent-deployments-heading"><h2 id="recent-deployments-heading">Recent deployments</h2>{deployments.length === 0 ? <p className="empty">No deployments yet. Use the form above to create your first deployment.</p> : <div className="deployment-list">{deployments.map((deployment) => <Link className="deployment-row" href={`/deployments/${deployment.id}`} key={deployment.id} aria-label={`View deployment ${deployment.actualName ?? deployment.requestedName}`}><StatusBadge status={deployment.status} /><span><strong>{deployment.actualName ?? deployment.requestedName}</strong><small>{deployment.repository} · {deployment.branch}</small></span><time dateTime={deployment.updatedAt.toISOString()}>{deployment.updatedAt.toLocaleString("en-US")}</time><span aria-hidden="true">→</span></Link>)}</div>}</section></AppShell>; }
