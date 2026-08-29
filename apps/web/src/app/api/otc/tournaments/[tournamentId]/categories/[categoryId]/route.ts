import { proxyToOtc, getUserIdFromRequest } from "../../../../_lib";

export const runtime = "nodejs";

type Params = { params: Promise<{ tournamentId: string; categoryId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return new Response(
      JSON.stringify({ ok: false, code: "UNAUTHENTICATED", message: "請先設定使用者（MVP 模擬登入）" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }
  const { tournamentId, categoryId } = await params;
  const body = await request.json().catch(() => ({}));
  return proxyToOtc(`/api/tournaments/${tournamentId}/categories/${categoryId}`, { method: "PATCH", body, userId });
}

export async function DELETE(request: Request, { params }: Params) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return new Response(
      JSON.stringify({ ok: false, code: "UNAUTHENTICATED", message: "請先設定使用者（MVP 模擬登入）" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }
  const { tournamentId, categoryId } = await params;
  return proxyToOtc(`/api/tournaments/${tournamentId}/categories/${categoryId}`, { method: "DELETE", userId });
}
