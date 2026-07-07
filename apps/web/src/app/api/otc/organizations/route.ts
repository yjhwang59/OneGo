import { proxyToOtc, getUserIdFromRequest } from "../_lib";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return new Response(
      JSON.stringify({ ok: false, code: "UNAUTHENTICATED", message: "請先設定使用者（MVP 模擬登入）" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }
  return proxyToOtc("/api/organizations", { method: "GET", userId });
}

export async function POST(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return new Response(
      JSON.stringify({ ok: false, code: "UNAUTHENTICATED", message: "請先設定使用者（MVP 模擬登入）" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }
  const body = await request.json().catch(() => ({}));
  return proxyToOtc("/api/organizations", { method: "POST", body, userId });
}
