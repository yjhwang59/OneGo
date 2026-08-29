import { proxyToOtc } from "../../../../_lib";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  return proxyToOtc(`/api/public/tournaments/${id}/categories`, { method: "GET" });
}
