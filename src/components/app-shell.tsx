import Link from "next/link";
import { redirect } from "next/navigation";
import type { AuthorizedUser } from "../lib/auth/authorization";
import { SignOutButton } from "./sign-out-button";
import { MobileNav } from "./mobile-nav";
import { NavLinks } from "./nav-links";

export function AppShell({ user, children }: { user: AuthorizedUser; children: React.ReactNode }) {
  if (user.mustChangePassword) redirect("/account/change-password");
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">본문으로 건너뛰기</a>
      <aside className="sidebar" aria-label="기본 탐색">
        <Link className="brand" href="/dashboard">배포 포털</Link>
        <NavLinks isAdmin={user.role === "ADMIN"} />
        <details className="account-card account-menu">
          <summary><span>{user.email ?? "계정"}</span><small>{user.role === "ADMIN" ? "관리자" : "사용자"}</small></summary>
          <div className="account-menu-content"><small>비공개 작업 공간</small><SignOutButton /></div>
        </details>
      </aside>
      <main id="main-content" className="content"><MobileNav isAdmin={user.role === "ADMIN"} /><div className="mobile-account"><span>{user.email ?? "계정"}</span><SignOutButton /></div>{children}</main>
    </div>
  );
}

export function ForbiddenPage() {
  return <main className="center-page"><section className="card narrow"><p className="eyebrow">403</p><h1>접근이 거부되었습니다</h1><p>이 페이지를 볼 권한이 없습니다.</p><Link className="button primary" href="/dashboard">대시보드로 돌아가기</Link></section></main>;
}
