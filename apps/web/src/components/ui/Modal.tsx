"use client";

import { useEffect, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * 受控 Modal。open 為真時顯示遮罩＋卡片；供後台 CRUD 表單使用。
 * - Esc 關閉、點遮罩關閉（loading 時鎖住）
 * - 開啟時鎖住 body 捲動
 * - 內容過長時卡片內部自行捲動
 */
export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  size = "md",
  loading,
}: {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, loading, onClose]);

  if (!open) return null;

  const maxW = size === "sm" ? "max-w-md" : size === "lg" ? "max-w-2xl" : "max-w-lg";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/40"
        aria-hidden
        onClick={loading ? undefined : onClose}
      />
      <div
        className={cn(
          "relative flex max-h-[calc(100dvh-2rem)] w-full flex-col rounded-token-xl border border-border bg-surface shadow-token-md",
          maxW
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
            {description && <div className="mt-1 text-sm text-muted-fg">{description}</div>}
          </div>
          <button
            type="button"
            aria-label="關閉"
            onClick={onClose}
            disabled={loading}
            className="-mr-1 -mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-token-md text-muted-fg hover:bg-surface-muted hover:text-foreground disabled:opacity-50"
          >
            <span aria-hidden className="text-xl leading-none">×</span>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-border px-5 py-4">{footer}</div>
        )}
      </div>
    </div>
  );
}
