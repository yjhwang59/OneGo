"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  PageHeader,
  GameBadge,
  StatusBadge,
  Badge,
  EmptyState,
  ErrorBanner,
  Spinner,
  Button,
} from "@/components/ui";
import { GAME_LABEL, TOURNAMENT_STATUS } from "@/lib/labels";

type Tournament = {
  id: string;
  name: string;
  gameKey: string;
  rulesetVersion: string;
  format: string;
  roundCount: number;
  status: string;
  timezone?: string;
  startsAt?: string;
  endsAt?: string;
};

// 公開列表只涵蓋這些狀態（見後端 listPublic）
const PUBLIC_STATUSES = [
  "published",
  "checkin_open",
  "pairing_ready",
  "in_progress",
  "closed",
] as const;

const REGISTRATION_OPEN = new Set(["published", "checkin_open"]);

function fmtDate(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function TournamentsBrowser() {
  const router = useRouter();
  const params = useSearchParams();

  // 篩選狀態的唯一來源就是 URL query（可分享、重新整理保留）
  const keyword = params.get("keyword") ?? "";
  const gameKey = params.get("gameKey") ?? "";
  const status = params.get("status") ?? "";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";

  const [list, setList] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 關鍵字輸入的本地緩衝（避免每次按鍵都改 URL）
  const [kwInput, setKwInput] = useState(keyword);

  useEffect(() => {
    setKwInput(keyword);
  }, [keyword]);

  const setParam = useCallback(
    (patch: Record<string, string>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      router.replace(next.toString() ? `/tournaments?${next.toString()}` : "/tournaments");
    },
    [params, router]
  );

  const hasFilters = !!(keyword || gameKey || status || from || to);

  // 伺服端可篩的（gameKey/status/keyword）交給 API；日期在前端過濾
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const qs = new URLSearchParams();
    if (gameKey) qs.set("gameKey", gameKey);
    if (status) qs.set("status", status);
    if (keyword) qs.set("keyword", keyword);
    fetch(`/api/otc/public-tournaments${qs.toString() ? `?${qs}` : ""}`, { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data?.message || data?.error || "無法載入賽事列表");
          setList([]);
          return;
        }
        const raw = data.upstream ?? data;
        setList(Array.isArray(raw) ? raw : []);
        setError(null);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "網路錯誤");
          setList([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [gameKey, status, keyword]);

  // 日期區間（依 startsAt）在前端套用
  const filtered = useMemo(() => {
    return list.filter((t) => {
      if (!from && !to) return true;
      if (!t.startsAt) return false;
      const d = t.startsAt.slice(0, 10);
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  }, [list, from, to]);

  const inputClass =
    "min-h-[44px] rounded-token-md border border-border bg-surface px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand";

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <PageHeader
        title="公開賽事"
        description="不需登入即可探索；點擊賽事查看詳情，報名時再登入。"
        actions={
          <Link href="/results">
            <Button variant="secondary">精彩回顧</Button>
          </Link>
        }
      />

      {/* 篩選列 */}
      <div className="mt-6 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-fg">關鍵字（名稱）</span>
          <input
            type="text"
            value={kwInput}
            onChange={(e) => setKwInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && setParam({ keyword: kwInput.trim() })}
            onBlur={() => kwInput.trim() !== keyword && setParam({ keyword: kwInput.trim() })}
            placeholder="搜尋賽事名稱…"
            className={`${inputClass} w-full sm:w-56`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-fg">棋種</span>
          <select
            value={gameKey}
            onChange={(e) => setParam({ gameKey: e.target.value })}
            className={inputClass}
          >
            <option value="">全部棋種</option>
            {Object.entries(GAME_LABEL).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-fg">狀態</span>
          <select
            value={status}
            onChange={(e) => setParam({ status: e.target.value })}
            className={inputClass}
          >
            <option value="">全部狀態</option>
            {PUBLIC_STATUSES.map((s) => (
              <option key={s} value={s}>
                {TOURNAMENT_STATUS[s].label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-fg">開始日（起）</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setParam({ from: e.target.value })}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-fg">開始日（迄）</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setParam({ to: e.target.value })}
            className={inputClass}
          />
        </label>
        {hasFilters && (
          <Button
            variant="ghost"
            onClick={() => router.replace("/tournaments")}
          >
            清除篩選
          </Button>
        )}
      </div>

      {/* 結果數 */}
      {!loading && !error && (
        <p className="mt-4 text-sm text-muted-fg">
          共 {filtered.length} 筆{hasFilters ? "（已套用篩選）" : ""}
        </p>
      )}

      {loading && (
        <div className="mt-8 flex items-center gap-3 text-muted-fg">
          <Spinner /> 載入賽事中…
        </div>
      )}

      {!loading && error && (
        <div className="mt-6">
          <ErrorBanner tone="warning">
            {error}
            <span className="mt-1 block text-xs font-normal">
              請確認 API 已啟動（預設 http://127.0.0.1:3875），或檢查 OTC_API_BASE。
            </span>
          </ErrorBanner>
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="mt-8">
          <EmptyState
            title={hasFilters ? "沒有符合篩選條件的賽事。" : "目前沒有可探索的公開賽事。"}
            description={
              hasFilters
                ? "試著放寬條件，或清除篩選重新瀏覽。"
                : "主辦單位建立並發布賽事後會顯示於此。"
            }
            action={
              hasFilters ? (
                <Button variant="secondary" onClick={() => router.replace("/tournaments")}>
                  清除篩選
                </Button>
              ) : undefined
            }
          />
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => {
            const start = fmtDate(t.startsAt);
            const open = REGISTRATION_OPEN.has(t.status);
            return (
              <li key={t.id}>
                <Link
                  href={`/tournaments/${t.id}`}
                  className="flex h-full min-h-[44px] flex-col rounded-token-xl border border-border bg-surface p-4 shadow-token-sm transition hover:shadow-token-md"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <GameBadge gameKey={t.gameKey} />
                    <StatusBadge domain="tournament" value={t.status} />
                    {open && <Badge tone="success">開放報名中</Badge>}
                  </div>
                  <span className="mt-3 font-semibold text-foreground">{t.name}</span>
                  <span className="mt-1 text-sm text-muted-fg">
                    {t.format} · {t.roundCount} 輪
                  </span>
                  {start && (
                    <span className="mt-2 text-xs text-muted-fg">開始日：{start}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

export default function TournamentsPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-8 text-muted-fg sm:px-6">
          <Spinner /> 載入中…
        </main>
      }
    >
      <TournamentsBrowser />
    </Suspense>
  );
}
