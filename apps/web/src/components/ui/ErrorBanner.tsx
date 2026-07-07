import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** 錯誤/警示橫幅。tone 預設 danger，可用 warning 做提醒。 */
export function ErrorBanner({
  children,
  tone = "danger",
  className,
}: {
  children: ReactNode;
  tone?: "danger" | "warning";
  className?: string;
}) {
  return (
    <div
      role="alert"
      style={{
        backgroundColor: `var(--tone-${tone}-bg)`,
        color: `var(--tone-${tone}-fg)`,
        borderColor: `var(--tone-${tone}-border)`,
      }}
      className={cn(
        "rounded-token-lg border px-4 py-3 text-sm font-medium",
        className
      )}
    >
      {children}
    </div>
  );
}
