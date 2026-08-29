"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUser } from "@/contexts/UserContext";
import {
  PageHeader,
  Button,
  Badge,
  StatusBadge,
  GameBadge,
  Spinner,
  ErrorBanner,
  EmptyState,
} from "@/components/ui";
import { cn } from "@/lib/cn";

type ScoresheetCell = {
  matchId: string;
  side: "A" | "B";
  opponentSeedNo: number | null;
  opponentId: string | null;
  score: number | null;
  firstMove: boolean;
  memo: string | null;
  status: string;
};

type ScoresheetPlayer = {
  playerId: string;
  displayName: string;
  seedNo: number | null;
  categoryKey: string | null;
  withdrawn: boolean;
};

type ScoresheetRow = {
  playerId: string;
  points: number;
  rank: number;
  tiebreaks: Record<string, number>;
};

type ScoresheetPayload = {
  tournament: {
    id: string;
    name: string;
    gameKey: string;
    status: string;
    winPoint: number;
  };
  rounds: number[];
  players: ScoresheetPlayer[];
  cells: Record<string, Record<number, ScoresheetCell>>;
  rows: ScoresheetRow[];
  tiebreakSpec: Array<{ id: string; label: string; tip: string }>;
  usedTiebreakCount: number;
};

type QueueItem = { matchId: string; result: Record<string, unknown>; ts: number };

const QUEUE_KEY = (tid: string) => `otc-scoresheet-queue:${tid}`;

function formatScore(v: number | null | undefined) {
  if (v == null || Number.isNaN(v)) return "";
  return Number.isInteger(v) ? String(v) : String(v);
}

/** 點擊循環：空 → 己勝 → 和 → 己負 → 空（回傳己方/對方得分） */
function cycleSelfOpp(
  self: number | null,
  opp: number | null,
  winPoint: number
): { self: number; opp: number } | null {
  const empty = self == null && opp == null;
  if (empty) return { self: winPoint, opp: 0 };
  if (self != null && self >= winPoint - 1e-9 && (opp ?? 0) <= 1e-9) {
    return { self: winPoint / 2, opp: winPoint / 2 };
  }
  if (self != null && opp != null && Math.abs(self - opp) < 1e-9) {
    return { self: 0, opp: winPoint };
  }
  return null;
}

function resultFromAB(scoreA: number, scoreB: number, winPoint: number) {
  if (scoreA >= winPoint - 1e-9 && scoreB <= 1e-9) return { kind: "win", winner: "A" };
  if (scoreB >= winPoint - 1e-9 && scoreA <= 1e-9) return { kind: "win", winner: "B" };
  return { kind: "draw" };
}

export default function RefereeScoresheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { userId, isAuthenticated } = useUser();
  const [sheet, setSheet] = useState<ScoresheetPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoryKey, setCategoryKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const [menu, setMenu] = useState<{ matchId: string; playerId: string; x: number; y: number } | null>(null);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!userId || !id) return;
    try {
      const qs = categoryKey ? `?categoryKey=${encodeURIComponent(categoryKey)}` : "";
      const res = await fetch(`/api/otc/tournaments/${id}/scoresheet${qs}`, {
        headers: { "x-user-id": userId },
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.message ?? data?.code ?? "無法載入戰績表");
        setSheet(null);
      } else {
        setSheet(data);
        setError(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "網路錯誤");
    } finally {
      setLoading(false);
    }
  }, [userId, id, categoryKey]);

  useEffect(() => {
    if (isAuthenticated && userId && id) load();
    else setLoading(false);
  }, [isAuthenticated, userId, id, load]);

  const flushQueue = useCallback(async () => {
    if (!userId || !id || !navigator.onLine) return;
    const raw = localStorage.getItem(QUEUE_KEY(id));
    if (!raw) return;
    let items: QueueItem[] = [];
    try {
      items = JSON.parse(raw);
    } catch {
      localStorage.removeItem(QUEUE_KEY(id));
      return;
    }
    if (!items.length) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/otc/tournaments/${id}/scoresheet/batch-results`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-id": userId },
        body: JSON.stringify({ items: items.map(({ matchId, result }) => ({ matchId, result })) }),
      });
      if (res.ok) {
        localStorage.removeItem(QUEUE_KEY(id));
        await load();
      }
    } finally {
      setBusy(false);
    }
  }, [userId, id, load]);

  useEffect(() => {
    const onOnline = () => flushQueue();
    window.addEventListener("online", onOnline);
    flushQueue();
    return () => window.removeEventListener("online", onOnline);
  }, [flushQueue]);

  const enqueue = useCallback(
    (item: QueueItem) => {
      if (!id) return;
      const raw = localStorage.getItem(QUEUE_KEY(id));
      let items: QueueItem[] = [];
      try {
        items = raw ? JSON.parse(raw) : [];
      } catch {
        items = [];
      }
      items = items.filter((x) => x.matchId !== item.matchId);
      items.push(item);
      localStorage.setItem(QUEUE_KEY(id), JSON.stringify(items));
      if (flushTimer.current) clearTimeout(flushTimer.current);
      flushTimer.current = setTimeout(() => flushQueue(), 350);
    },
    [id, flushQueue]
  );

  const canScore = sheet?.tournament.status === "in_progress";
  const winPoint = sheet?.tournament.winPoint ?? 1;

  const rowByPlayer = useMemo(() => {
    const m = new Map<string, ScoresheetRow>();
    for (const r of sheet?.rows ?? []) m.set(r.playerId, r);
    return m;
  }, [sheet]);

  const sortedPlayers = useMemo(() => {
    if (!sheet) return [];
    return [...sheet.players].sort((a, b) => {
      const ra = rowByPlayer.get(a.playerId)?.rank ?? 9999;
      const rb = rowByPlayer.get(b.playerId)?.rank ?? 9999;
      if (ra !== rb) return ra - rb;
      return (a.seedNo ?? 0) - (b.seedNo ?? 0);
    });
  }, [sheet, rowByPlayer]);

  const categories = useMemo(() => {
    if (!sheet) return [] as string[];
    return [...new Set(sheet.players.map((p) => p.categoryKey?.trim() || "").filter(Boolean))].sort();
  }, [sheet]);

  const visibleTiebreaks = useMemo(() => {
    if (!sheet) return [];
    return sheet.tiebreakSpec.slice(0, sheet.usedTiebreakCount);
  }, [sheet]);

  const onScoreClick = (playerId: string, roundNo: number) => {
    if (!sheet || !canScore) return;
    const cell = sheet.cells[playerId]?.[roundNo];
    if (!cell || cell.memo === "輪空" || !cell.opponentId) return;
    const oppId = cell.opponentId;
    const oppCell = sheet.cells[oppId]?.[roundNo];
    const next = cycleSelfOpp(cell.score, oppCell?.score ?? null, winPoint);

    setSheet((prev) => {
      if (!prev) return prev;
      const cells = { ...prev.cells };
      const aMap = { ...(cells[playerId] ?? {}) };
      const bMap = { ...(cells[oppId] ?? {}) };
      if (!next) {
        aMap[roundNo] = { ...aMap[roundNo]!, score: null, status: "scheduled" };
        bMap[roundNo] = { ...bMap[roundNo]!, score: null, status: "scheduled" };
      } else {
        aMap[roundNo] = { ...aMap[roundNo]!, score: next.self, status: "finished" };
        bMap[roundNo] = { ...bMap[roundNo]!, score: next.opp, status: "finished" };
      }
      cells[playerId] = aMap;
      cells[oppId] = bMap;
      return { ...prev, cells };
    });

    if (!next) {
      enqueue({ matchId: cell.matchId, result: { kind: "void", reason: "manual" }, ts: Date.now() });
      return;
    }
    const scoreA = cell.side === "A" ? next.self : next.opp;
    const scoreB = cell.side === "A" ? next.opp : next.self;
    enqueue({
      matchId: cell.matchId,
      result: resultFromAB(scoreA, scoreB, winPoint),
      ts: Date.now(),
    });
  };

  const recordFoul = async (matchId: string, playerId: string) => {
    if (!userId) return;
    setMenu(null);
    await fetch(`/api/otc/matches/${matchId}/fouls`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-user-id": userId },
      body: JSON.stringify({ playerId, kind: "illegal_move" }),
    });
    await load();
  };

  if (!isAuthenticated) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <ErrorBanner tone="warning">請先登入以進行裁判計分。</ErrorBanner>
      </main>
    );
  }
  if (loading) {
    return (
      <main className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-8 text-muted-fg sm:px-6">
        <Spinner /> 載入戰績表…
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[100vw] px-2 py-6 sm:px-4 lg:px-6">
      <div className="mx-auto max-w-6xl">
        <Link href="/referee" className="inline-flex min-h-[44px] items-center text-sm text-muted-fg hover:text-foreground">
          ← 返回裁判賽事
        </Link>
        <PageHeader
          className="mt-3"
          title="裁判戰績表"
          description={
            <span className="flex flex-wrap items-center gap-2">
              {sheet && <GameBadge gameKey={sheet.tournament.gameKey} />}
              {sheet && <StatusBadge domain="tournament" value={sheet.tournament.status} />}
              <span>{sheet?.tournament.name}</span>
              {sheet && <Badge tone="muted">勝分 {sheet.tournament.winPoint}</Badge>}
            </span>
          }
          actions={
            <div className="flex flex-wrap gap-2">
              <Link href={`/referee/${id}/tables`}>
                <Button variant="secondary" size="sm">逐桌視圖</Button>
              </Link>
              <Button variant="secondary" size="sm" onClick={() => load()} disabled={busy}>
                重新整理
              </Button>
            </div>
          }
        />
        {!canScore && (
          <div className="mt-4">
            <ErrorBanner tone="warning">
              僅在賽事「進行中」時可輸入成績。目前：{sheet?.tournament.status ?? "未知"}
            </ErrorBanner>
          </div>
        )}
        {error && (
          <div className="mt-4">
            <ErrorBanner>{error}</ErrorBanner>
          </div>
        )}
        {categories.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-fg">組別</span>
            <select
              value={categoryKey}
              onChange={(e) => {
                setLoading(true);
                setCategoryKey(e.target.value);
              }}
              className="min-h-[44px] rounded-token-md border border-border bg-surface px-3 text-sm"
            >
              <option value="">全部／未篩選</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        )}
        <p className="mt-2 text-xs text-muted-fg">
          點得分格循環：勝 → 和 → 負 → 清空；右鍵可記技術犯規。離線時會暫存，恢復連線後自動上傳。
        </p>
      </div>

      {!sheet || sheet.players.length === 0 ? (
        <div className="mx-auto mt-6 max-w-6xl">
          <EmptyState title="尚無可計分選手" description="請確認報到與編排已完成。" />
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-token-lg border border-border bg-surface">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="bg-muted/40 text-left text-xs text-muted-fg">
                <th className="sticky left-0 z-20 min-w-[48px] bg-muted/40 px-2 py-3">籤</th>
                <th className="sticky left-[48px] z-20 min-w-[96px] bg-muted/40 px-2 py-3">姓名</th>
                {sheet.rounds.map((r) => (
                  <th key={r} colSpan={2} className="min-w-[88px] border-l border-border px-1 py-3 text-center">
                    R{r}
                  </th>
                ))}
                <th className="min-w-[52px] px-2 py-3 text-center">總分</th>
                <th className="min-w-[44px] px-2 py-3 text-center">名次</th>
                {visibleTiebreaks.map((tb) => (
                  <th
                    key={tb.id}
                    className="min-w-[52px] cursor-help px-1 py-3 text-center"
                    onClick={(e) => {
                      const rect = (e.target as HTMLElement).getBoundingClientRect();
                      setTip({ text: tb.tip, x: rect.left, y: rect.bottom + 6 });
                    }}
                  >
                    {tb.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedPlayers.map((p) => {
                const row = rowByPlayer.get(p.playerId);
                return (
                  <tr key={p.playerId} className={cn("border-t border-border", p.withdrawn && "opacity-50")}>
                    <td className="sticky left-0 z-10 bg-surface px-2 py-1 text-center font-medium">
                      {p.seedNo ?? "—"}
                    </td>
                    <td className="sticky left-[48px] z-10 max-w-[120px] truncate bg-surface px-2 py-1 font-medium">
                      {p.withdrawn ? <s>{p.displayName}</s> : p.displayName}
                    </td>
                    {sheet.rounds.map((r) => {
                      const cell = sheet.cells[p.playerId]?.[r];
                      return (
                        <td key={`${p.playerId}-${r}`} colSpan={2} className="border-l border-border p-0">
                          <div className="flex">
                            <button
                              type="button"
                              disabled={!canScore || !cell || !!cell.memo}
                              onClick={() => onScoreClick(p.playerId, r)}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                if (!cell || cell.memo) return;
                                setMenu({
                                  matchId: cell.matchId,
                                  playerId: p.playerId,
                                  x: e.clientX,
                                  y: e.clientY,
                                });
                              }}
                              className={cn(
                                "flex min-h-[44px] min-w-[44px] flex-1 items-center justify-center text-sm font-semibold",
                                cell?.score != null && "bg-[var(--tone-success-bg)]/40",
                                canScore && cell && !cell.memo && "hover:bg-brand/10"
                              )}
                            >
                              {cell?.memo === "輪空" ? "—" : formatScore(cell?.score)}
                            </button>
                            <div
                              className={cn(
                                "flex min-h-[44px] min-w-[40px] flex-1 items-center justify-center border-l border-border/60 text-xs text-muted-fg",
                                cell?.firstMove && "font-bold text-foreground"
                              )}
                            >
                              {cell?.memo ?? (cell?.opponentSeedNo ?? "")}
                            </div>
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-2 py-1 text-center font-semibold">{formatScore(row?.points)}</td>
                    <td className="px-2 py-1 text-center">{row?.rank ?? ""}</td>
                    {visibleTiebreaks.map((tb) => (
                      <td key={tb.id} className="px-1 py-1 text-center text-xs text-muted-fg">
                        {formatScore(row?.tiebreaks?.[tb.id])}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tip && (
        <div
          className="fixed z-50 max-w-xs rounded-token-md border border-border bg-surface px-3 py-2 text-xs shadow-lg"
          style={{ left: tip.x, top: tip.y }}
          onClick={() => setTip(null)}
        >
          {tip.text}
        </div>
      )}
      {menu && (
        <div
          className="fixed z-50 min-w-[160px] rounded-token-md border border-border bg-surface py-1 shadow-lg"
          style={{ left: menu.x, top: menu.y }}
        >
          <button
            type="button"
            className="block w-full min-h-[44px] px-4 text-left text-sm hover:bg-muted/40"
            onClick={() => recordFoul(menu.matchId, menu.playerId)}
          >
            記技術犯規
          </button>
          <button
            type="button"
            className="block w-full min-h-[44px] px-4 text-left text-sm hover:bg-muted/40"
            onClick={() => setMenu(null)}
          >
            取消
          </button>
        </div>
      )}
      {busy && (
        <p className="mt-2 flex items-center justify-center gap-2 text-center text-xs text-muted-fg">
          <Spinner size="sm" /> 同步成績中…
        </p>
      )}
    </main>
  );
}
