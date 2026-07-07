export function getOtcApiBase(): string {
  // server-only：用於 Next route handlers 轉呼叫 apps/api，避免瀏覽器 CORS 問題
  const base =
    process.env.OTC_API_BASE ||
    process.env.NEXT_PUBLIC_OTC_API_BASE ||
    "http://127.0.0.1:3875";
  return base.replace(/\/+$/, "");
}

type ProxyOpts = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: string | object;
  userId?: string | null;
  /** GET 查詢參數，會附加到 path */
  query?: Record<string, string>;
};

/** 轉發請求到 OTC API，可帶 x-user-id（MVP 模擬登入）。設有逾時避免卡住。 */
const OTC_PROXY_TIMEOUT_MS = 20_000;

export async function proxyToOtc(path: string, opts: ProxyOpts = {}): Promise<Response> {
  const base = getOtcApiBase();
  const { method = "GET", body, userId, query } = opts;
  let url = `${base}${path}`;
  if (query && Object.keys(query).length > 0) {
    const q = new URLSearchParams(query).toString();
    url += (path.includes("?") ? "&" : "?") + q;
  }
  const headers: Record<string, string> = {};
  if (userId) headers["x-user-id"] = userId;
  // 當 POST/PATCH 未帶 body 時送空物件，避免後端回傳 "Body cannot be empty when content-type is application/json"
  const bodyStr =
    body !== undefined
      ? typeof body === "string"
        ? body
        : JSON.stringify(body)
      : method === "POST" || method === "PATCH"
        ? "{}"
        : undefined;
  // 只有實際帶 body 時才設 JSON content-type；否則（如 DELETE/GET）省略，
  // 避免 Fastify 因「content-type: application/json 但 body 為空」而回 400。
  if (bodyStr !== undefined) headers["Content-Type"] = "application/json";
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OTC_PROXY_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, { method, headers, body: bodyStr, signal: controller.signal });
  } catch (err) {
    clearTimeout(timeoutId);
    const isAbort = err instanceof Error && err.name === "AbortError";
    return new Response(
      JSON.stringify({
        ok: false,
        code: isAbort ? "TIMEOUT" : "NETWORK_ERROR",
        message: isAbort
          ? "請求逾時，請確認 OTC API 與資料庫是否正常（預設 API: http://127.0.0.1:3875）"
          : "無法連線至 API，請確認 OTC API 已啟動（預設 http://127.0.0.1:3875）",
      }),
      { status: isAbort ? 504 : 502, headers: { "Content-Type": "application/json" } }
    );
  }
  clearTimeout(timeoutId);
  // 無內容狀態（如 DELETE 的 204）不可帶 body，直接回傳空 Response。
  if (res.status === 204 || res.status === 205 || res.status === 304) {
    return new Response(null, { status: res.status });
  }
  const text = await res.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return null; } })() : null;
  const payload = res.ok ? data : { ok: false, code: data?.code, message: data?.message, upstream: data };
  return new Response(JSON.stringify(payload), {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}

/** 優先從 NextAuth session 取得 OTC userId，無 session 時 fallback 到 x-user-id（模擬登入）。 */
export async function getUserIdFromRequest(request: Request): Promise<string | null> {
  try {
    const { getServerSession } = await import("next-auth");
    const { authOptions } = await import("@/lib/auth");
    const session = await getServerSession(authOptions);
    const sessionUserId = (session?.user as { id?: string } | undefined)?.id;
    if (sessionUserId) return sessionUserId;
  } catch {
    // next-auth or auth not available
  }
  return request.headers.get("x-user-id") || null;
}

