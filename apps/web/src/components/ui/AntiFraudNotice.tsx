import { cn } from "@/lib/cn";

/**
 * 反詐提示（P5）：付款頁/通知模板固定文案。
 * 對齊常見賽務詐騙手法，明確告知平台絕不會要求儲值/匯款/代辦退費。
 */
export function AntiFraudNotice({ className }: { className?: string }) {
  return (
    <div
      style={{
        backgroundColor: "var(--tone-warning-bg)",
        color: "var(--tone-warning-fg)",
        borderColor: "var(--tone-warning-border)",
      }}
      className={cn("rounded-token-lg border px-4 py-3 text-sm", className)}
      role="note"
    >
      <p className="font-semibold">🔒 反詐提醒</p>
      <p className="mt-1 leading-6">
        OneGo 與主辦單位<strong>絕不會</strong>透過電話或私訊，要求你儲值、購買點數、提供 ATM/網銀操作或「代辦退費」。
        繳費一律於官方頁面完成；收到可疑要求請勿操作，並向主辦或平台確認。
      </p>
    </div>
  );
}
