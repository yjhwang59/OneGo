import { proxyToOtc, getUserIdFromRequest } from "@/app/api/otc/_lib";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return new Response(
      JSON.stringify({ ok: false, code: "UNAUTHENTICATED", message: "請先設定使用者（MVP 模擬登入）" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }
  const { tournamentId } = await params;
  const url = new URL(request.url);
  const qs = url.searchParams.toString();
  return proxyToOtc(`/api/tournaments/${tournamentId}/scoresheet${qs ? `?${qs}` : ""}`, {
    method: "GET",
    userId,
  });
}
