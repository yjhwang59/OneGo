import { proxyToOtc, getUserIdFromRequest } from "../../../_lib";

export const runtime = "nodejs";

type Params = { params: Promise<{ orgId: string }> };

export async function GET(request: Request, { params }: Params) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return new Response(
      JSON.stringify({ ok: false, code: "UNAUTHENTICATED", message: "請先設定使用者（MVP 模擬登入）" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }
  const { orgId } = await params;
  return proxyToOtc(`/api/organizations/${orgId}/members`, { method: "GET", userId });
}

export async function POST(request: Request, { params }: Params) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return new Response(
      JSON.stringify({ ok: false, code: "UNAUTHENTICATED", message: "請先設定使用者（MVP 模擬登入）" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }
  const { orgId } = await params;
  const body = await request.json().catch(() => ({}));
  return proxyToOtc(`/api/organizations/${orgId}/members`, { method: "POST", body, userId });
}
