"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  PageHeader,
  GameBadge,
  EmptyState,
  ErrorBanner,
  Spinner,
  Button,
} from "@/components/ui";

type Tournament = {
  id: string;
  name: string;
  gameKey: string;
  format: string;
  roundCount: number;
  status: string;
  startsAt?: string;
  endsAt?: string;
};

function fmtDate(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export default function ResultsPage() {
  const [list, setList] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/otc/public-tournaments?status=closed", { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data?.message || data?.error || "無法載入賽事歸檔");
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
  }, []);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <PageHeader
        title="精彩回顧"
        description="已結束賽事的歸檔；點擊可查看最終名次榜。"
        actions={
          <Link href="/tournaments">
            <Button variant="secondary">瀏覽進行中賽事</Button>
          </Link>
        }
      />

      {loading && (
        <div className="mt-8 flex items-center gap-3 text-muted-fg">
          <Spinner /> 載入中…
        </div>
      )}

      {!loading && error && (
        <div className="mt-6">
          <ErrorBanner tone="warning">{error}</ErrorBanner>
        </div>
      )}

      {!loading && !error && list.length === 0 && (
        <div className="mt-8">
          <EmptyState
            title="尚無已結束的賽事。"
            description="賽事結算封存後會出現在這裡。"
          />
        </div>
      )}

      {!loading && !error && list.length > 0 && (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((t) => {
            const end = fmtDate(t.endsAt) ?? fmtDate(t.startsAt);
            return (
              <li key={t.id}>
                <Link
                  href={`/tournaments/${t.id}`}
                  className="flex h-full flex-col rounded-token-xl border border-border bg-surface p-4 shadow-token-sm transition hover:shadow-token-md"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <GameBadge gameKey={t.gameKey} />
                  </div>
                  <span className="mt-3 font-semibold text-foreground">{t.name}</span>
                  <span className="mt-1 text-sm text-muted-fg">
                    {t.format} · {t.roundCount} 輪
                  </span>
                  {end && <span className="mt-2 text-xs text-muted-fg">結束日：{end}</span>}
                  <span className="mt-3 text-sm font-medium text-brand-subtle-fg">
                    查看名次榜 →
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
