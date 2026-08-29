"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useUser } from "@/contexts/UserContext";
import {
  PageHeader,
  Card,
  CardBody,
  Button,
  Badge,
  StatusBadge,
  GameBadge,
  Spinner,
  ErrorBanner,
  EmptyState,
} from "@/components/ui";
import { cn } from "@/lib/cn";

type Match = {
  id: string;
  tournamentId: string;
  roundNo: number;
  tableNo?: number | null;
  categoryKey?: string | null;
  playerAId: string;
  playerBId: string;
  firstMove?: "A" | "B" | null;
  status: string;
  result?: { kind: string; winner?: string } | null;
};
type Tournament = { id: string; name: string; gameKey: string; status: string };
type StandingsRow = { playerId: string; points: number; wins: number; draws: number; losses: number; categoryKey?: string | null };

const DEFAULT_GROUP = "未分組";

export default function RefereeTournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { userId, isAuthenticated } = useUser();
  const [matches, setMatches] = useState<Match[]>([]);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [standings, setStandings] = useState<StandingsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyMatch, setBusyMatch] = useState<string | null>(null);
  const [showStandings, setShowStandings] = useState(false);
  const [filterGroup, setFilterGroup] = useState<string>("all");

  const load = useCallback(async () => {
    if (!userId || !id) return;
    try {
      const [mRes, tRes, sRes] = await Promise.all([
        fetch(`/api/otc/tournaments/${id}/matches`, { headers: { "x-user-id": userId }, cache: "no-store" }),
        fetch(`/api/otc/public/tournaments/${id}`, { cache: "no-store" }),
        fetch(`/api/otc/tournaments/${id}/standings`, { headers: { "x-user-id": userId }, cache: "no-store" }),
      ]);
      const mData = await mRes.json().catch(() => []);
      const tData = await tRes.json().catch(() => null);
      const sData = await sRes.json().catch(() => []);
      setMatches(mRes.ok && Array.isArray(mData) ? mData : []);
      if (tRes.ok && tData?.id) setTournament(tData);
      setStandings(sRes.ok && Array.isArray(sData) ? sData : []);
      setError(mRes.ok ? null : (mData?.message ?? mData?.code ?? "無法載入對局"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "網路錯誤");
      setMatches([]);
    } finally {
      setLoading(false);
    }
  }, [userId, id]);

  useEffect(() => {
    if (isAuthenticated && userId && id) load();
    else setLoading(false);
  }, [isAuthenticated, userId, id, load]);

  const canScore = tournament?.status === "in_progress";

  const submit = useCallback(
    async (match: Match, kind: "winA" | "winB" | "draw" | "void") => {
      if (!userId || !canScore || busyMatch) return; // 防重複送出
      const result =
        kind === "winA" ? { kind: "win", winner: "A" }
          : kind === "winB" ? { kind: "win", winner: "B" }
          : kind === "draw" ? { kind: "draw" }
          : { kind: "void" };
      setBusyMatch(match.id);
      try {
        const res = await fetch(`/api/otc/matches/${match.id}/result`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-user-id": userId },
          body: JSON.stringify({ result }),
        });
        if (res.ok) await load();
        else {
          const data = await res.json().catch(() => null);
          setError(data?.message ?? data?.code ?? "上傳失敗");
        }
      } finally {
        setBusyMatch(null);
      }
    },
    [userId, canScore, busyMatch, load]
  );

  const groupOptions = useMemo(() => {
    const keys = new Set(matches.map((m) => m.categoryKey?.trim() || DEFAULT_GROUP));
    return [...keys].sort();
  }, [matches]);

  const filteredMatches = useMemo(() => {
    if (filterGroup === "all") return matches;
    return matches.filter((m) => (m.categoryKey?.trim() || DEFAULT_GROUP) === filterGroup);
  }, [matches, filterGroup]);

  // 逐輪逐桌：依 round → table 排序，分組顯示
  const rounds = useMemo(() => {
    const map = new Map<number, Match[]>();
    for (const m of filteredMatches) {
      if (!map.has(m.roundNo)) map.set(m.roundNo, []);
      map.get(m.roundNo)!.push(m);
    }
    return [...map.entries()]
      .sort((a, b) => b[0] - a[0]) // 最新一輪在上
      .map(([roundNo, list]) => ({
        roundNo,
        list: list.sort((x, y) => (x.tableNo ?? 0) - (y.tableNo ?? 0)),
      }));
  }, [filteredMatches]);

  const pending = filteredMatches.filter((m) => m.status !== "finished").length;

  if (!isAuthenticated) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <ErrorBanner tone="warning">請先登入（或模擬登入）以進行裁判計分。</ErrorBanner>
      </main>
    );
  }
  if (loading) {
    return (
      <main className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-8 text-muted-fg sm:px-6">
        <Spinner /> 載入中…
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Link href={`/referee/${id}`} className="inline-flex min-h-[44px] items-center text-sm text-muted-fg hover:text-foreground">
        ← 返回戰績表
      </Link>

      <PageHeader
        className="mt-4"
        title="逐桌計分"
        description={
          <span className="flex flex-wrap items-center gap-2">
            {tournament && <GameBadge gameKey={tournament.gameKey} />}
            {tournament && <StatusBadge domain="tournament" value={tournament.status} />}
            <span>{tournament?.name}</span>
          </span>
        }
        actions={
          <div className="flex gap-2">
            <Link href={`/referee/${id}`}>
              <Button variant="secondary" size="sm">戰績表</Button>
            </Link>
            <Button variant="secondary" size="sm" onClick={() => setShowStandings((v) => !v)}>
              {showStandings ? "隱藏排名" : "即時排名"}
            </Button>
          </div>
        }
      />

      {!canScore && (
        <div className="mt-4">
          <ErrorBanner tone="warning">
            僅在賽事「進行中」時可輸入成績。目前狀態：{tournament?.status ?? "未知"}
          </ErrorBanner>
        </div>
      )}
      {error && (
        <div className="mt-4">
          <ErrorBanner>{error}</ErrorBanner>
        </div>
      )}

      {matches.length > 0 && groupOptions.length > 1 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-fg">篩選組別</span>
          <select
            value={filterGroup}
            onChange={(e) => setFilterGroup(e.target.value)}
            className="min-h-[44px] rounded-token-md border border-border bg-surface px-3 text-sm text-foreground"
          >
            <option value="all">全部組別</option>
            {groupOptions.map((g) => (
              <option key={g} value={g}>{g === DEFAULT_GROUP ? "未分組" : g}</option>
            ))}
          </select>
        </div>
      )}

      {showStandings && (
        <Card className="mt-4">
          <CardBody>
            <h2 className="text-sm font-semibold text-foreground">即時排名</h2>
            {standings.length === 0 ? (
              <p className="mt-2 text-sm text-muted-fg">尚無排名（需有已結束對局）。</p>
            ) : (
              <div className="mt-3 space-y-4">
                {(() => {
                  const map = new Map<string, StandingsRow[]>();
                  for (const s of standings) {
                    const g = s.categoryKey?.trim() || DEFAULT_GROUP;
                    if (!map.has(g)) map.set(g, []);
                    map.get(g)!.push(s);
                  }
                  return [...map.entries()].map(([g, rows]) => (
                    <div key={g}>
                      {map.size > 1 && <p className="text-xs font-medium text-muted-fg">分組：{g === DEFAULT_GROUP ? "未分組" : g}</p>}
                      <ol className="mt-1 space-y-1">
                        {rows.map((s, i) => (
                          <li key={s.playerId} className="flex items-center justify-between text-sm">
                            <span className="text-foreground"><span className="text-muted-fg">{i + 1}.</span> {s.playerId}</span>
                            <span className="text-muted-fg">{s.wins}/{s.draws}/{s.losses} · <span className="font-semibold text-foreground">{s.points}</span></span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ));
                })()}
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {filteredMatches.length > 0 && (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-token-lg border border-border bg-surface px-4 py-3">
            <p className="text-xs text-muted-fg">桌次</p>
            <p className="text-xl font-bold text-foreground">{filteredMatches.length}</p>
          </div>
          <div className="rounded-token-lg border border-border bg-surface px-4 py-3">
            <p className="text-xs text-muted-fg">待輸入</p>
            <p className="text-xl font-bold text-foreground">{pending}</p>
          </div>
          <div className="rounded-token-lg border border-border bg-surface px-4 py-3">
            <p className="text-xs text-muted-fg">已完成</p>
            <p className="text-xl font-bold text-foreground">{filteredMatches.length - pending}</p>
          </div>
        </div>
      )}

      {filteredMatches.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="此賽事尚無對局。" description="請先由主辦編排配對。" />
        </div>
      ) : (
        <div className="mt-4 space-y-6">
          {rounds.map(({ roundNo, list }) => (
            <section key={roundNo}>
              <h2 className="mb-2 text-sm font-semibold text-foreground">第 {roundNo} 輪</h2>
              <ul className="space-y-3">
                {list.map((m) => (
                  <TableCard
                    key={m.id}
                    match={m}
                    canScore={canScore}
                    busy={busyMatch === m.id}
                    onSubmit={submit}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}

function TableCard({
  match,
  canScore,
  busy,
  onSubmit,
}: {
  match: Match;
  canScore: boolean;
  busy: boolean;
  onSubmit: (m: Match, kind: "winA" | "winB" | "draw" | "void") => void;
}) {
  const finished = match.status === "finished";
  const r = match.result;
  const winner = finished && r?.kind === "win" ? r.winner : null;
  const isDraw = finished && r?.kind === "draw";
  const isVoid = finished && r?.kind === "void";
  const group = match.categoryKey?.trim() || DEFAULT_GROUP;

  const sideBtn = (side: "A" | "B", kind: "winA" | "winB") => {
    const pid = side === "A" ? match.playerAId : match.playerBId;
    const won = winner === side;
    const first = match.firstMove === side;
    return (
      <button
        type="button"
        disabled={!canScore || busy}
        onClick={() => onSubmit(match, kind)}
        className={cn(
          "flex min-h-[52px] flex-1 items-center justify-between gap-2 rounded-token-md border px-3 text-left transition",
          won ? "border-[var(--tone-success-border)] bg-[var(--tone-success-bg)] text-[var(--tone-success-fg)]"
              : "border-border bg-surface text-foreground",
          canScore && !busy && "hover:border-brand",
          (!canScore || busy) && "cursor-default opacity-90"
        )}
      >
        <span className="min-w-0 truncate font-medium">
          {pid}
          {first && <span className="ml-1 text-[10px] text-muted-fg">先</span>}
        </span>
        <span className="text-xs font-semibold">{won ? "勝" : canScore ? "判勝" : ""}</span>
      </button>
    );
  };

  return (
    <li>
      <Card className={cn(!finished && "ring-1 ring-[var(--tone-warning-border)]")}>
        <CardBody className="space-y-3">
          <div className="flex items-center justify-between text-xs text-muted-fg">
            <span>
              {match.tableNo != null ? `桌 ${match.tableNo}` : "—"}
              {group !== DEFAULT_GROUP && ` · ${group}`}
            </span>
            {finished ? (
              <Badge tone={isVoid ? "muted" : isDraw ? "warning" : "success"}>
                {isVoid ? "已作廢" : isDraw ? "和局" : `${winner === "A" ? match.playerAId : match.playerBId} 勝`}
              </Badge>
            ) : (
              <Badge tone="warning">待輸入</Badge>
            )}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
            {sideBtn("A", "winA")}
            <div className="flex items-center justify-center px-1 text-xs text-muted-fg">vs</div>
            {sideBtn("B", "winB")}
          </div>

          {canScore && (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={isDraw ? "primary" : "secondary"}
                onClick={() => onSubmit(match, "draw")}
                disabled={busy}
              >
                和局
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onSubmit(match, "void")}
                disabled={busy}
              >
                作廢
              </Button>
              {busy && <span className="inline-flex items-center text-sm text-muted-fg"><Spinner size="sm" /></span>}
            </div>
          )}
        </CardBody>
      </Card>
    </li>
  );
}
