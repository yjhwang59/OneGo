"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser } from "@/contexts/UserContext";

const navItems = [
  { href: "/admin", label: "後台首頁" },
  { href: "/admin/organizations", label: "主辦單位" },
  { href: "/admin/tournaments", label: "賽事管理" },
];

const platformNavItems = [
  { href: "/admin/platform", label: "平台總覽" },
  { href: "/admin/platform/organizations", label: "全平台主辦" },
  { href: "/admin/platform/users", label: "全平台用戶" },
];

export function AdminSidebar({
  onNavigate,
  className = "",
}: {
  onNavigate?: () => void;
  className?: string;
}) {
  const pathname = usePathname();
  const { platformRole } = useUser();
  const isPlatformAdmin = platformRole === "platform_admin";

  const linkClass = (href: string) =>
    `inline-flex min-h-[44px] min-w-[44px] items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
      pathname === href || (href !== "/admin" && pathname.startsWith(href))
        ? "bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-50"
        : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
    }`;

  return (
    <nav className={className} aria-label="主辦後台選單">
      <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        主辦後台
      </div>
      <ul className="mt-3 space-y-1">
        {navItems.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className={linkClass(item.href)}
              onClick={onNavigate}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
      {isPlatformAdmin && (
        <>
          <div className="mt-6 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            平台管理
          </div>
          <ul className="mt-3 space-y-1">
            {platformNavItems.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={linkClass(item.href)}
                  onClick={onNavigate}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </nav>
  );
}
