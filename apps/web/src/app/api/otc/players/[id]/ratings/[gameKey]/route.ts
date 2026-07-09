import { proxyToOtc } from "../../../../_lib";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; gameKey: string }> }
) {
  const { id, gameKey } = await params;
  return proxyToOtc(
    `/api/players/${encodeURIComponent(id)}/ratings/${encodeURIComponent(gameKey)}`,
    { method: "GET" }
  );
}
