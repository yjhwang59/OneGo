import { NextResponse } from "next/server";
import { getOtcApiBase } from "../../../../_lib";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const base = getOtcApiBase();
  const url = new URL(request.url);
  const categoryKey = url.searchParams.get("categoryKey");
  let target = `${base}/api/public/tournaments/${id}/official-results`;
  if (categoryKey) target += `?categoryKey=${encodeURIComponent(categoryKey)}`;
  try {
    const res = await fetch(target, { cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, code: data?.code, message: data?.message },
        { status: res.status }
      );
    }
    return NextResponse.json(data);
  } catch (e: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        hint: "請確認 apps/api 是否已啟動。",
      },
      { status: 502 }
    );
  }
}
