import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-token-xl border border-border bg-surface-muted p-8 text-center",
        className
      )}
    >
      <p className="font-medium text-foreground">{title}</p>
      {description && (
        <p className="mt-2 text-sm text-muted-fg">{description}</p>
      )}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
