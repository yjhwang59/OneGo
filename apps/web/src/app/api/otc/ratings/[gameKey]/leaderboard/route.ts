import { proxyToOtc } from "../../../_lib";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ gameKey: string }> }
) {
  const { gameKey } = await params;
  const { searchParams } = new URL(request.url);
  const query: Record<string, string> = {};
  const limit = searchParams.get("limit");
  const offset = searchParams.get("offset");
  if (limit != null) query.limit = limit;
  if (offset != null) query.offset = offset;
  return proxyToOtc(`/api/ratings/${encodeURIComponent(gameKey)}/leaderboard`, { method: "GET", query });
}
