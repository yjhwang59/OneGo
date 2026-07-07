import { proxyToOtc, getUserIdFromRequest } from "../../../_lib";

export const runtime = "nodejs";

type Params = { params: Promise<{ tournamentId: string }> };

export async function GET(request: Request, { params }: Params) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return new Response(
      JSON.stringify({ ok: false, code: "UNAUTHENTICATED", message: "請先設定使用者（MVP 模擬登入）" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }
  const { tournamentId } = await params;
  return proxyToOtc(`/api/tournaments/${tournamentId}/registrations`, { method: "GET", userId });
}

export async function POST(
  request: Request,
  { params }: Params
) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return new Response(
      JSON.stringify({ ok: false, code: "UNAUTHENTICATED", message: "請先設定使用者（MVP 模擬登入）" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }
  const { tournamentId } = await params;
  let body: { userId: string; categoryKey?: string };
  try {
    body = await request.json();
  } catch {
    body = { userId };
  }
  if (!body.userId) body.userId = userId;
  return proxyToOtc(`/api/tournaments/${tournamentId}/registrations`, {
    method: "POST",
    body: body,
    userId,
  });
}
