"use client";

import { useEffect, useState } from "react";
import { useUser } from "@/contexts/UserContext";
import {
  PageHeader,
  Card,
  CardBody,
  GameBadge,
  Spinner,
  ErrorBanner,
  EmptyState,
} from "@/components/ui";

type Tally = { games: number; wins: number; draws: number; losses: number; winRate: number };
type RecordResponse = {
  overall: Tally;
  byGame: Array<{ gameKey: string } & Tally>;
  topOpponents: Array<{ opponentId: string; games: number }>;
  totals: { registrations: number; tournaments: number };
};

function WinRateBar({ rate }: { rate: number }) {
  const pct = Math.round(rate * 100);
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between text-xs text-muted-fg">
        <span>勝率</span>
        <span className="font-semibold text-foreground">{pct}%</span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-surface-muted">
        <div
          className="h-full rounded-full bg-brand"
          style={{ width: `${pct}%` }}
          aria-hidden
        />
      </div>
    </div>
  );
}

export default function MeRecordPage() {
  const { userId, isAuthenticated } = useUser();
  const [rec, setRec] = useState<RecordResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !userId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch("/api/otc/me/record", { headers: { "x-user-id": userId } })
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data?.message || data?.code || "無法載入戰績");
          return;
        }
        setRec(data);
        setError(null);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "網路錯誤"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, userId]);

  if (!isAuthenticated) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <ErrorBanner tone="warning">請先模擬登入以查看戰績履歷。</ErrorBanner>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <PageHeader title="戰績履歷" description="跨棋種、跨賽事的累積戰績與勝率。" />

      {loading && (
        <div className="mt-8 flex items-center gap-3 text-muted-fg">
          <Spinner /> 載入中…
        </div>
      )}

      {!loading && error && (
        <div className="mt-6">
          <ErrorBanner>{error}</ErrorBanner>
        </div>
      )}

      {!loading && !error && rec && rec.overall.games === 0 && (
        <div className="mt-8">
          <EmptyState
            title="尚無已完成的對局。"
            description="完成第一場對局後，這裡會開始累積您的跨棋種戰績。"
          />
        </div>
      )}

      {!loading && !error && rec && rec.overall.games > 0 && (
        <div className="mt-6 space-y-6">
          {/* 總計 */}
          <Card>
            <CardBody>
              <h2 className="text-sm font-semibold text-foreground">總計</h2>
              <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat label="總對局" value={rec.overall.games} />
                <Stat label="勝" value={rec.overall.wins} />
                <Stat label="和" value={rec.overall.draws} />
                <Stat label="負" value={rec.overall.losses} />
              </div>
              <WinRateBar rate={rec.overall.winRate} />
            </CardBody>
          </Card>

          {/* 分棋種 */}
          <div>
            <h2 className="text-sm font-semibold text-foreground">分棋種</h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {rec.byGame.map((g) => (
                <Card key={g.gameKey}>
                  <CardBody>
                    <div className="flex items-center justify-between">
                      <GameBadge gameKey={g.gameKey} />
                      <span className="text-sm text-muted-fg">{g.games} 場</span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <Stat label="勝" value={g.wins} />
                      <Stat label="和" value={g.draws} />
                      <Stat label="負" value={g.losses} />
                    </div>
                    <WinRateBar rate={g.winRate} />
                  </CardBody>
                </Card>
              ))}
            </div>
          </div>

          {/* 常見對手 */}
          {rec.topOpponents.length > 0 && (
            <Card>
              <CardBody>
                <h2 className="text-sm font-semibold text-foreground">常見對手</h2>
                <ul className="mt-3 divide-y divide-border">
                  {rec.topOpponents.map((o) => (
                    <li key={o.opponentId} className="flex items-center justify-between py-2 text-sm">
                      <span className="text-foreground">{o.opponentId}</span>
                      <span className="text-muted-fg">對戰 {o.games} 次</span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
        </div>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-xs text-muted-fg">{label}</div>
      <div className="text-xl font-bold text-foreground">{value}</div>
    </div>
  );
}
