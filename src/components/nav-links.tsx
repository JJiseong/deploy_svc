"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks({ isAdmin, mobile = false, onNavigate }: { isAdmin: boolean; mobile?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const links = [
    { href: "/dashboard", label: "대시보드" },
    { href: "/guide", label: "사용법" },
    ...(isAdmin ? [{ href: "/admin/users", label: "사용자 관리" }, { href: "/admin/audit-logs", label: "감사 로그" }] : []),
  ];
  return <nav aria-label={mobile ? "모바일 탐색" : "기본 탐색"} className={mobile ? "mobile-links" : undefined}>
    {links.map((link) => <Link key={link.href} href={link.href} aria-current={pathname === link.href ? "page" : undefined} onClick={onNavigate}>{link.label}</Link>)}
  </nav>;
}
