"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/me", label: "總覽" },
  { href: "/me/registrations", label: "我的報名" },
  { href: "/me/record", label: "戰績履歷" },
];

export default function MeLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div>
      <nav className="border-b border-border">
        <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 sm:px-6">
          {TABS.map((tab) => {
            const active =
              tab.href === "/me" ? pathname === "/me" : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "inline-flex min-h-[44px] items-center border-b-2 px-3 text-sm font-medium whitespace-nowrap",
                  active
                    ? "border-brand text-foreground"
                    : "border-transparent text-muted-fg hover:text-foreground"
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>
      {children}
    </div>
  );
}
