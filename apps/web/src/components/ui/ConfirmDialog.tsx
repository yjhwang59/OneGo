"use client";

import type { ReactNode } from "react";
import { Button } from "./Button";

/** 受控確認對話框。open 為真時顯示遮罩＋卡片。 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "確定",
  cancelLabel = "取消",
  danger,
  loading,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/40"
        aria-hidden
        onClick={loading ? undefined : onCancel}
      />
      <div className="relative w-full max-w-md rounded-token-xl border border-border bg-surface p-5 shadow-token-md">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        {description && <div className="mt-2 text-sm text-muted-fg">{description}</div>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
