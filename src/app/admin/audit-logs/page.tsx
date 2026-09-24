import Link from "next/link";
import { redirect } from "next/navigation";
import type { AuditOutcome } from "@prisma/client";
import { prisma } from "../../../lib/db";
import { getCurrentUser } from "../../../lib/auth/current-user";
import { AppShell, ForbiddenPage } from "../../../components/app-shell";

export const dynamic = "force-dynamic";

const actionLabels: Record<string, string> = {
  AUTH_SIGN_IN: "Authentication sign-in",
  AUTH_SIGN_OUT: "Authentication sign-out",
  DEPLOYMENT_REQUESTED: "Deployment requested",
  DEPLOYMENT_FAILURE: "Deployment failed",
  DEPLOYMENT_RECONCILED: "Deployment reconciled",
  ACCESS_GRANT_CREATE: "Access grant created",
  ACCESS_GRANT_ROLE: "Access grant role changed",
  ACCESS_GRANT_ACTIVATE: "Access grant activated",
  ACCESS_GRANT_DEACTIVATE: "Access grant deactivated",
  CREDENTIAL_REVEAL: "Credential revealed",
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
    <header className="page-header"><div><p className="eyebrow">Administration</p><h1 tabIndex={-1}>Audit logs</h1><p className="muted">Redacted activity history for this portal.</p></div></header>
    <section className="card" aria-labelledby="audit-results-heading">
      <h2 id="audit-results-heading" className="sr-only">Audit log results</h2>
      <form className="filter-form" method="get">
        <label htmlFor="audit-action">Action<select id="audit-action" name="action" defaultValue={filters.action ?? ""}><option value="">All actions</option><option value="AUTH_SIGN_IN">Authentication sign-in</option><option value="DEPLOYMENT_REQUESTED">Deployment requested</option><option value="ACCESS_GRANT_CREATE">Access grant created</option><option value="CREDENTIAL_REVEAL">Credential revealed</option></select></label>
        <label htmlFor="audit-outcome">Outcome<select id="audit-outcome" name="outcome" defaultValue={filters.outcome ?? ""}><option value="">All outcomes</option><option value="SUCCESS">Success</option><option value="DENIED">Denied</option><option value="FAILURE">Failure</option></select></label>
        <label htmlFor="audit-from">From<input id="audit-from" name="from" type="date" defaultValue={filters.from ?? ""} /></label>
        <label htmlFor="audit-to">To<input id="audit-to" name="to" type="date" defaultValue={filters.to ?? ""} /></label>
        <button type="submit" className="button primary">Apply filters</button><Link className="button text" href="/admin/audit-logs">Clear</Link>
      </form>
      <div className="table-wrap"><table><caption className="sr-only">Audit events</caption><thead><tr><th scope="col">Time</th><th scope="col">Actor</th><th scope="col">Action</th><th scope="col">Outcome</th><th scope="col">Target</th></tr></thead><tbody>{logs.map((log) => <tr key={log.id}><td data-label="Time"><time dateTime={log.createdAt.toISOString()}>{log.createdAt.toLocaleString()}</time></td><td data-label="Actor">{log.actor?.githubLogin ?? "System"}</td><td data-label="Action">{actionLabels[log.action] ?? log.action.replaceAll("_", " ")}</td><td data-label="Outcome"><span aria-hidden="true">{log.outcome === "SUCCESS" ? "✓" : log.outcome === "DENIED" ? "!" : "×"}</span> {log.outcome}</td><td data-label="Target">{log.targetType ?? "—"}</td></tr>)}</tbody></table></div>
      {logs.length === 0 && <p className="empty">No audit events match these filters. <Link href="/admin/audit-logs">Clear filters</Link></p>}
      <nav className="pagination" aria-label="Audit log pages"><span>Page {page} of {pages}</span>{page > 1 ? <Link className="button secondary" href={href(page - 1)}>Previous</Link> : <span className="button secondary disabled-link" aria-disabled="true">Previous</span>}{page < pages ? <Link className="button secondary" href={href(page + 1)}>Next</Link> : <span className="button secondary disabled-link" aria-disabled="true">Next</span>}</nav>
    </section>
  </AppShell>;
}
