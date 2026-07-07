"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useUser } from "@/contexts/UserContext";
import {
  PageHeader,
  Card,
  CardBody,
  Badge,
  GameBadge,
  Button,
  Spinner,
  ErrorBanner,
  EmptyState,
} from "@/components/ui";
import { gameLabel, type Tone } from "@/lib/labels";

type Outcome = "win" | "draw" | "loss";
type RecordResponse = {
  overall: { games: number; wins: number; draws: number; losses: number; winRate: number };
  recentMatches: Array<{
    id: string;
    tournamentId: string;
    tournamentName: string;
    gameKey: string;
    roundNo: number;
    opponentId: string;
    outcome: Outcome;
    finishedAt: string;
  }>;
  reminders: { awaitingPayment: number; awaitingCheckin: number };
  totals: { registrations: number; tournaments: number };
};

const OUTCOME: Record<Outcome, { label: string; tone: Tone }> = {
  win: { label: "勝", tone: "success" },
  draw: { label: "和", tone: "warning" },
  loss: { label: "負", tone: "danger" },
};

export default function MePage() {
  const { userId, isAuthenticated, displayName } = useUser();
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
          setError(data?.message || data?.code || "無法載入個人資料");
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
        <ErrorBanner tone="warning">
          請先模擬登入以查看個人中心。點擊右上角「模擬」並輸入使用者 ID（例如 user-001）。
        </ErrorBanner>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <PageHeader
        title={displayName || userId || "個人中心"}
        description="您的報名、繳費、對局與戰績總覽。"
      />

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

      {!loading && !error && rec && (
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          {/* 提醒 + 摘要 */}
          <div className="space-y-4 lg:col-span-1">
            <Card>
              <CardBody>
                <h2 className="text-sm font-semibold text-foreground">待辦提醒</h2>
                {rec.reminders.awaitingPayment === 0 && rec.reminders.awaitingCheckin === 0 ? (
                  <p className="mt-2 text-sm text-muted-fg">目前沒有待處理事項 🎉</p>
                ) : (
                  <div className="mt-3 flex flex-col gap-2">
                    {rec.reminders.awaitingPayment > 0 && (
                      <Link
                        href="/me/registrations"
                        className="flex items-center justify-between rounded-token-md border border-border px-3 py-2 hover:bg-surface-muted"
                      >
                        <span className="text-sm text-foreground">待繳費</span>
                        <Badge tone="warning">{rec.reminders.awaitingPayment} 筆</Badge>
                      </Link>
                    )}
                    {rec.reminders.awaitingCheckin > 0 && (
                      <Link
                        href="/me/registrations"
                        className="flex items-center justify-between rounded-token-md border border-border px-3 py-2 hover:bg-surface-muted"
                      >
                        <span className="text-sm text-foreground">待報到</span>
                        <Badge tone="info">{rec.reminders.awaitingCheckin} 筆</Badge>
                      </Link>
                    )}
                  </div>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <h2 className="text-sm font-semibold text-foreground">總覽</h2>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-muted-fg">參賽賽事</dt>
                    <dd className="text-xl font-bold text-foreground">{rec.totals.tournaments}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-fg">總對局</dt>
                    <dd className="text-xl font-bold text-foreground">{rec.overall.games}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-fg">勝／和／負</dt>
                    <dd className="text-base font-semibold text-foreground">
                      {rec.overall.wins}／{rec.overall.draws}／{rec.overall.losses}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-fg">勝率</dt>
                    <dd className="text-xl font-bold text-foreground">
                      {Math.round(rec.overall.winRate * 100)}%
                    </dd>
                  </div>
                </dl>
                <Link href="/me/record" className="mt-3 inline-block text-sm font-medium text-brand-subtle-fg hover:underline">
                  查看完整戰績履歷 →
                </Link>
              </CardBody>
            </Card>

            <div className="flex flex-wrap gap-2">
              <Link href="/tournaments">
                <Button variant="secondary">瀏覽賽事</Button>
              </Link>
              <Link href="/me/registrations">
                <Button variant="secondary">我的報名</Button>
              </Link>
            </div>
          </div>

          {/* 近期對局 */}
          <div className="lg:col-span-2">
            <Card>
              <CardBody>
                <h2 className="text-sm font-semibold text-foreground">近期對局</h2>
                {rec.recentMatches.length === 0 ? (
                  <div className="mt-3">
                    <EmptyState
                      title="尚無已完成的對局。"
                      description="賽事開始並產生結果後，會顯示於此。"
                    />
                  </div>
                ) : (
                  <ul className="mt-3 divide-y divide-border">
                    {rec.recentMatches.map((m) => (
                      <li key={m.id} className="flex items-center justify-between gap-3 py-3">
                        <div className="min-w-0">
                          <Link
                            href={`/me/tournaments/${m.tournamentId}/matches`}
                            className="font-medium text-foreground hover:underline"
                          >
                            {m.tournamentName}
                          </Link>
                          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-fg">
                            <GameBadge gameKey={m.gameKey} />
                            <span>第 {m.roundNo} 輪</span>
                            <span>vs {m.opponentId}</span>
                          </p>
                        </div>
                        <Badge tone={OUTCOME[m.outcome].tone}>{OUTCOME[m.outcome].label}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          </div>
        </div>
      )}
    </main>
  );
}
