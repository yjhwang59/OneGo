import { proxyToOtc, getUserIdFromRequest } from "../../../../_lib";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ tournamentId: string; roleId: string }> }
) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return new Response(
      JSON.stringify({ ok: false, code: "UNAUTHENTICATED", message: "請先設定使用者（MVP 模擬登入）" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }
  const { tournamentId, roleId } = await params;
  return proxyToOtc(`/api/tournaments/${tournamentId}/roles/${roleId}`, { method: "DELETE", userId });
}
