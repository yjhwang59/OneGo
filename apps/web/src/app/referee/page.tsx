"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/contexts/UserContext";
import {
  PageHeader,
  GameBadge,
  StatusBadge,
  Spinner,
  ErrorBanner,
  EmptyState,
} from "@/components/ui";

type Tournament = { id: string; name: string; gameKey: string; status: string };
type RefereeTournament = { roleId: string; tournament: Tournament };

export default function RefereeHomePage() {
  const { userId, isAuthenticated } = useUser();
  const [items, setItems] = useState<RefereeTournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/otc/me/referee-tournaments", { headers: { "x-user-id": userId } });
      const data = await res.json().catch(() => null);
      if (res.ok && Array.isArray(data)) {
        setItems(data);
        setError(null);
      } else {
        setItems([]);
        setError(data?.message ?? data?.code ?? "無法載入裁判賽事");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "網路錯誤");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (isAuthenticated && userId) load();
    else setLoading(false);
  }, [isAuthenticated, userId, load]);

  if (!isAuthenticated) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <ErrorBanner tone="warning">請先登入（或模擬登入）以進入裁判計分。</ErrorBanner>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <PageHeader title="裁判計分" description="您被指派為裁判的賽事" />

      {loading ? (
        <div className="mt-8 flex items-center gap-3 text-muted-fg">
          <Spinner /> 載入中…
        </div>
      ) : error ? (
        <div className="mt-6">
          <ErrorBanner>{error}</ErrorBanner>
        </div>
      ) : items.length === 0 ? (
        <div className="mt-8">
          <EmptyState title="您目前沒有被指派為任何賽事的裁判。" />
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {items.map(({ roleId, tournament: t }) => (
            <li key={roleId}>
              <Link
                href={`/referee/${t.id}`}
                className="flex items-center justify-between rounded-token-xl border border-border bg-surface p-4 shadow-token-sm transition hover:shadow-token-md"
              >
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{t.name}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-2">
                    <GameBadge gameKey={t.gameKey} />
                    <StatusBadge domain="tournament" value={t.status} />
                  </p>
                </div>
                <span className="text-muted-fg">→</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
