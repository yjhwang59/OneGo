import { NextResponse } from "next/server";
import { getOtcApiBase } from "../_lib";

export const runtime = "nodejs";

const PASS_THROUGH = ["status", "gameKey", "keyword"] as const;

export async function GET(request: Request) {
  const base = getOtcApiBase();
  const incoming = new URL(request.url).searchParams;
  const forwarded = new URLSearchParams();
  for (const key of PASS_THROUGH) {
    const v = incoming.get(key);
    if (v) forwarded.set(key, v);
  }
  const qs = forwarded.toString();
  try {
    const res = await fetch(
      `${base}/api/public/tournaments${qs ? `?${qs}` : ""}`,
      { cache: "no-store" }
    );
    const data = await res.json().catch(() => null);
    return NextResponse.json({ ok: res.ok, upstream: data }, { status: res.ok ? 200 : res.status });
  } catch (e: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        hint: "請確認 apps/api 是否已啟動（預設 http://127.0.0.1:3875），或設定 OTC_API_BASE。",
      },
      { status: 502 }
    );
  }
}

