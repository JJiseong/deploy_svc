"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks({ isAdmin, mobile = false, onNavigate }: { isAdmin: boolean; mobile?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const links = [
    { href: "/dashboard", label: "Dashboard" },
    ...(isAdmin ? [{ href: "/admin/users", label: "Users" }, { href: "/admin/audit-logs", label: "Audit logs" }] : []),
  ];
  return <nav aria-label={mobile ? "Mobile navigation" : "Primary navigation"} className={mobile ? "mobile-links" : undefined}>
    {links.map((link) => <Link key={link.href} href={link.href} aria-current={pathname === link.href ? "page" : undefined} onClick={onNavigate}>{link.label}</Link>)}
  </nav>;
}
