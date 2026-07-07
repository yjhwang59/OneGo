import { cn } from "@/lib/cn";

export function Spinner({
  size = "md",
  className,
  label = "載入中",
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
  label?: string;
}) {
  const dim = size === "sm" ? "h-4 w-4" : size === "lg" ? "h-8 w-8" : "h-5 w-5";
  return (
    <span
      role="status"
      aria-label={label}
      className={cn(
        "inline-block animate-spin rounded-full border-2 border-current border-t-transparent",
        dim,
        className
      )}
    />
  );
}
