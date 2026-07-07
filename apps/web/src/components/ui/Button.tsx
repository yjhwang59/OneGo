import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "./Spinner";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "md" | "sm";

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-brand text-brand-fg hover:bg-brand-hover focus-visible:ring-brand",
  secondary:
    "border border-border bg-surface text-foreground hover:bg-surface-muted focus-visible:ring-brand",
  danger:
    "bg-[var(--tone-danger-fg)] text-white hover:opacity-90 focus-visible:ring-[var(--tone-danger-fg)]",
  ghost:
    "text-foreground hover:bg-surface-muted focus-visible:ring-brand",
};

// 觸控目標 ≥ 44px（見 docs/08-ui-rwd-guidelines.md）
const SIZE: Record<Size, string> = {
  md: "min-h-[44px] px-4 text-sm",
  sm: "min-h-[36px] px-3 text-sm",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, disabled, children, className, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-token-md font-semibold",
        "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50",
        VARIANT[variant],
        SIZE[size],
        className
      )}
      {...rest}
    >
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  );
});
