import type { CSSProperties, ReactNode } from "react";
import type { Tone } from "@/lib/labels";
import { cn } from "@/lib/cn";

/**
 * 語意色調 chip。色彩來自 globals.css 的 --tone-*，深淺色自動切換。
 * 用 inline style 讀 CSS 變數，避免 Tailwind purge 掉動態類別。
 */
export function Badge({
  tone = "neutral",
  children,
  dotColor,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  /** 可選：左側小圓點顏色（例如棋種色 CSS 變數） */
  dotColor?: string;
  className?: string;
}) {
  const style: CSSProperties = {
    backgroundColor: `var(--tone-${tone}-bg)`,
    color: `var(--tone-${tone}-fg)`,
    borderColor: `var(--tone-${tone}-border)`,
  };
  return (
    <span
      style={style}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        className
      )}
    >
      {dotColor && (
        <span
          aria-hidden
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: dotColor }}
        />
      )}
      {children}
    </span>
  );
}
