import { proxyToOtc, getUserIdFromRequest } from "@/app/api/otc/_lib";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return new Response(
      JSON.stringify({ ok: false, code: "UNAUTHENTICATED", message: "請先設定使用者（MVP 模擬登入）" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }
  const { searchParams } = new URL(request.url);
  const query: Record<string, string> = {};
  const limit = searchParams.get("limit");
  const offset = searchParams.get("offset");
  const q = searchParams.get("q");
  if (limit != null) query.limit = limit;
  if (offset != null) query.offset = offset;
  if (q != null) query.q = q;
  return proxyToOtc("/api/platform/users", { method: "GET", userId, query });
}

export async function POST(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return new Response(
      JSON.stringify({ ok: false, code: "UNAUTHENTICATED", message: "請先登入" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }
  const body = await request.json().catch(() => ({}));
  return proxyToOtc("/api/platform/users", { method: "POST", body, userId });
}
