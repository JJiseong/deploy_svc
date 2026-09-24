import Link from "next/link";
import type { AuthorizedUser } from "../lib/auth/authorization";
import { SignOutButton } from "./sign-out-button";
import { MobileNav } from "./mobile-nav";
import { NavLinks } from "./nav-links";

export function AppShell({ user, children }: { user: AuthorizedUser; children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <aside className="sidebar" aria-label="Primary navigation">
        <Link className="brand" href="/dashboard">Deploy Portal</Link>
        <NavLinks isAdmin={user.role === "ADMIN"} />
        <details className="account-card account-menu">
          <summary><span>{user.githubLogin ? `@${user.githubLogin}` : user.role === "ADMIN" ? "Administrator" : "Member"}</span><small>{user.role === "ADMIN" ? "Administrator" : "Member"}</small></summary>
          <div className="account-menu-content"><small>Private workspace</small><SignOutButton /></div>
        </details>
      </aside>
      <main id="main-content" className="content"><MobileNav isAdmin={user.role === "ADMIN"} /><div className="mobile-account"><span>{user.githubLogin ? `@${user.githubLogin}` : user.role === "ADMIN" ? "Administrator" : "Member"}</span><SignOutButton /></div>{children}</main>
    </div>
  );
}

export function ForbiddenPage() {
  return <main className="center-page"><section className="card narrow"><p className="eyebrow">403</p><h1>Access denied</h1><p>You do not have permission to view this page.</p><Link className="button primary" href="/dashboard">Return to dashboard</Link></section></main>;
}
