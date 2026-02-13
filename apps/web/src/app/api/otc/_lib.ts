export function getOtcApiBase(): string {
  // server-only：用於 Next route handlers 轉呼叫 apps/api，避免瀏覽器 CORS 問題
  const base =
    process.env.OTC_API_BASE ||
    process.env.NEXT_PUBLIC_OTC_API_BASE ||
    "http://127.0.0.1:3001";
  return base.replace(/\/+$/, "");
}

