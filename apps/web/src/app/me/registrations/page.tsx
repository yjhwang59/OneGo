"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/contexts/UserContext";
import {
  PageHeader,
  StatusBadge,
  GameBadge,
  EmptyState,
  ErrorBanner,
  Spinner,
  Button,
  AntiFraudNotice,
} from "@/components/ui";

type Registration = {
  id: string;
  tournamentId: string;
  userId: string;
  status: string;
  categoryKey?: string;
  createdAt: string;
  updatedAt: string;
};

type Tournament = {
  id: string;
  name: string;
  gameKey: string;
  status: string;
};

export default function MyRegistrationsPage() {
  const { userId, isAuthenticated } = useUser();
  const [list, setList] = useState<Registration[]>([]);
  const [tournaments, setTournaments] = useState<Record<string, Tournament>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch("/api/otc/me/registrations", {
        headers: { "x-user-id": userId },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.message || data?.code || "無法載入報名列表");
        setList([]);
        return;
      }
      const regs = Array.isArray(data) ? data : [];
      setList(regs);
      setError(null);
      const ids = [...new Set(regs.map((r: Registration) => r.tournamentId))];
      const map: Record<string, Tournament> = {};
      await Promise.all(
        ids.map(async (tid) => {
          try {
            const tr = await fetch(`/api/otc/public/tournaments/${tid}`);
            const t = await tr.json();
            if (tr.ok && t.id) map[tid] = t;
          } catch {
            // ignore
          }
        })
      );
      setTournaments(map);
    } catch (e) {
      setError(e instanceof Error ? e.message : "網路錯誤");
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (isAuthenticated && userId) load();
    else setLoading(false);
  }, [isAuthenticated, userId, load]);

  const cancelRegistration = useCallback(
    async (registrationId: string) => {
      if (!userId) return;
      setCancellingId(registrationId);
      try {
        const res = await fetch(
          `/api/otc/registrations/${registrationId}/events/cancel`,
          {
            method: "POST",
            headers: { "x-user-id": userId },
          }
        );
        if (res.ok) await load();
      } finally {
        setCancellingId(null);
      }
    },
    [userId, load]
  );

  if (!isAuthenticated) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <ErrorBanner tone="warning">
          請先模擬登入以查看「我的報名」。點擊右上角「模擬」並輸入使用者 ID（例如 user-001）。
        </ErrorBanner>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-8 text-muted-fg sm:px-6">
        <Spinner /> 載入報名列表中…
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <PageHeader
        title="我的報名"
        description="您已報名的賽事；付款與報到由主辦單位處理（MVP）。"
      />

      <div className="mt-4">
        <AntiFraudNotice />
      </div>

      {error && (
        <div className="mt-6">
          <ErrorBanner>{error}</ErrorBanner>
        </div>
      )}

      {!error && list.length === 0 && (
        <div className="mt-8">
          <EmptyState
            title="尚無報名紀錄。"
            action={
              <Link href="/tournaments">
                <Button>瀏覽賽事</Button>
              </Link>
            }
          />
        </div>
      )}

      {!error && list.length > 0 && (
        <ul className="mt-6 space-y-4">
          {list.map((r) => {
            const t = tournaments[r.tournamentId];
            return (
              <li
                key={r.id}
                className="flex flex-col gap-3 rounded-token-xl border border-border bg-surface p-4 shadow-token-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <Link
                    href={`/tournaments/${r.tournamentId}`}
                    className="font-semibold text-foreground hover:underline"
                  >
                    {t?.name ?? r.tournamentId}
                  </Link>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {t && <GameBadge gameKey={t.gameKey} />}
                    <StatusBadge domain="registration" value={r.status} />
                    {t && (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-fg">
                        賽事 <StatusBadge domain="tournament" value={t.status} />
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/tournaments/${r.tournamentId}`}
                    className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-token-md border border-border px-4 text-sm font-medium text-foreground hover:bg-surface-muted"
                  >
                    查看賽事
                  </Link>
                  <Link
                    href={`/me/tournaments/${r.tournamentId}/matches`}
                    className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-token-md border border-border px-4 text-sm font-medium text-foreground hover:bg-surface-muted"
                  >
                    我的對局
                  </Link>
                  {r.status !== "cancelled" && (
                    <Button
                      variant="danger"
                      onClick={() => cancelRegistration(r.id)}
                      loading={cancellingId === r.id}
                    >
                      {cancellingId === r.id ? "取消中…" : "取消報名"}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
