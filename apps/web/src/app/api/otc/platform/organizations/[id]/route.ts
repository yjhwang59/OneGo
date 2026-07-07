import { proxyToOtc, getUserIdFromRequest } from "@/app/api/otc/_lib";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return new Response(
      JSON.stringify({ ok: false, code: "UNAUTHENTICATED", message: "請先設定使用者（MVP 模擬登入）" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }
  const { id } = await params;
  return proxyToOtc(`/api/platform/organizations/${id}`, { method: "GET", userId });
}
