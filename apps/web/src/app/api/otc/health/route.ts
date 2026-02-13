import { NextResponse } from "next/server";
import { getOtcApiBase } from "../_lib";

export const runtime = "nodejs";

export async function GET() {
  const base = getOtcApiBase();
  try {
    const res = await fetch(`${base}/api/health`, { cache: "no-store" });
    const data = await res.json().catch(() => null);
    return NextResponse.json({ ok: res.ok, upstream: data }, { status: res.ok ? 200 : res.status });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: e?.message ?? String(e),
        hint: "請確認 apps/api 是否已啟動（預設 http://127.0.0.1:3001），或設定 OTC_API_BASE。",
      },
      { status: 502 }
    );
  }
}

