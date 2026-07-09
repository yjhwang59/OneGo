"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import {
  PageHeader,
  Card,
  Spinner,
  ErrorBanner,
  EmptyState,
} from "@/components/ui";
import { GAME_LABEL, gameLabel } from "@/lib/labels";
import { maskName } from "@/lib/privacy";

type Row = {
  playerId: string;
  currentRating: number;
  peakRating: number;
  gamesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
};

const GAME_KEYS = Object.keys(GAME_LABEL);

export default function LeaderboardPage({ params }: { params: Promise<{ gameKey: string }> }) {
  const { gameKey } = use(params);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/otc/ratings/${gameKey}/leaderboard`, { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data?.message || data?.code || "無法載入排行榜");
          setRows([]);
          return;
        }
        setRows(Array.isArray(data) ? data : []);
        setError(null);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "網路錯誤"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [gameKey]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <PageHeader
        title="等級分排行榜"
        description="依 ELO 等級分排名（跨賽事累積）。為保護隱私，姓名已部分遮罩。"
      />

      {/* 棋種切換 */}
      <div className="mt-4 flex flex-wrap gap-2">
        {GAME_KEYS.map((k) => (
          <Link
            key={k}
            href={`/ratings/${k}`}
            className={
              k === gameKey
                ? "rounded-full bg-brand px-3 py-1.5 text-sm font-semibold text-brand-fg"
                : "rounded-full border border-border px-3 py-1.5 text-sm text-foreground hover:bg-surface-muted"
            }
          >
            {gameLabel(k)}
          </Link>
        ))}
      </div>

      {loading ? (
        <div className="mt-8 flex items-center gap-3 text-muted-fg">
          <Spinner /> 載入中…
        </div>
      ) : error ? (
        <div className="mt-6">
          <ErrorBanner>{error}</ErrorBanner>
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title={`${gameLabel(gameKey)}尚無等級分資料。`}
            description="主辦單位於賽事結束後計算等級分，排名即會出現在此。"
          />
        </div>
      ) : (
        <Card className="mt-6">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-fg">
                  <th className="px-4 py-2">#</th>
                  <th className="px-4 py-2">棋手</th>
                  <th className="px-4 py-2 text-right">等級分</th>
                  <th className="px-4 py-2 text-right">峰值</th>
                  <th className="px-4 py-2 text-right">勝/和/負</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.playerId} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 text-muted-fg">{i + 1}</td>
                    <td className="px-4 py-2 font-medium text-foreground">{maskName(r.playerId)}</td>
                    <td className="px-4 py-2 text-right font-bold text-foreground">{r.currentRating}</td>
                    <td className="px-4 py-2 text-right text-muted-fg">{r.peakRating}</td>
                    <td className="px-4 py-2 text-right text-muted-fg">
                      {r.wins}/{r.draws}/{r.losses}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </main>
  );
}
