import { proxyToOtc, getUserIdFromRequest } from "@/app/api/otc/_lib";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return new Response(
      JSON.stringify({ ok: false, code: "UNAUTHENTICATED", message: "請先設定使用者（MVP 模擬登入）" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  return proxyToOtc(`/api/registrations/${id}/payments`, { method: "POST", body, userId });
}
