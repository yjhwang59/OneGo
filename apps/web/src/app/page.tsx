"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Button,
  GameBadge,
  StatusBadge,
  Badge,
  Spinner,
} from "@/components/ui";
import { GAME_LABEL } from "@/lib/labels";

type Tournament = {
  id: string;
  name: string;
  gameKey: string;
  format: string;
  roundCount: number;
  status: string;
  startsAt?: string;
};

const OPEN_STATUSES = new Set(["published", "checkin_open"]);

function fmtDate(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export default function Home() {
  const [featured, setFeatured] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/otc/public-tournaments", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        const raw = data?.upstream ?? data;
        const list: Tournament[] = Array.isArray(raw) ? raw : [];
        setFeatured(list.filter((t) => OPEN_STATUSES.has(t.status)).slice(0, 6));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
      {/* Hero */}
      <section className="pt-12 sm:pt-16">
        <div className="max-w-3xl">
          <span className="inline-flex items-center rounded-full bg-brand-subtle px-3 py-1 text-xs font-semibold text-brand-subtle-fg">
            多棋種一站式雲端賽務平台
          </span>
          <h1 className="mt-4 text-4xl font-extrabold leading-tight tracking-tight text-foreground sm:text-5xl">
            辦一場棋賽，從報名到成績，一站搞定
          </h1>
          <p className="mt-5 text-lg leading-8 text-muted-fg">
            OneGo棋賽雲整合線上報名繳費、現場報到與對局編排、即時成績與歷史戰績。
            參賽者用同一帳號，累積跨棋種、跨賽事的棋力成長履歷。
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link href="/tournaments">
              <Button className="w-full sm:w-auto">瀏覽賽事</Button>
            </Link>
            <Link href="/ratings/go">
              <Button variant="secondary" className="w-full sm:w-auto">
                查榜單
              </Button>
            </Link>
          </div>
          {/* 支援棋種 */}
          <div className="mt-6 flex flex-wrap gap-2">
            {Object.keys(GAME_LABEL).map((k) => (
              <GameBadge key={k} gameKey={k} />
            ))}
          </div>
        </div>
      </section>

      {/* 開放報名中 */}
      <section className="mt-14">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            開放報名中
          </h2>
          <Link
            href="/tournaments?status=published"
            className="text-sm font-medium text-brand-subtle-fg hover:underline"
          >
            查看全部 →
          </Link>
        </div>

        {loading ? (
          <div className="mt-6 flex items-center gap-3 text-muted-fg">
            <Spinner /> 載入中…
          </div>
        ) : featured.length === 0 ? (
          <div className="mt-6 rounded-token-xl border border-border bg-surface-muted p-8 text-center text-muted-fg">
            目前沒有開放報名中的賽事，
            <Link href="/tournaments" className="text-brand-subtle-fg hover:underline">
              瀏覽所有賽事
            </Link>
            。
          </div>
        ) : (
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((t) => {
              const start = fmtDate(t.startsAt);
              return (
                <li key={t.id}>
                  <Link
                    href={`/tournaments/${t.id}`}
                    className="flex h-full flex-col rounded-token-xl border border-border bg-surface p-4 shadow-token-sm transition hover:shadow-token-md"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <GameBadge gameKey={t.gameKey} />
                      <StatusBadge domain="tournament" value={t.status} />
                      <Badge tone="success">開放報名中</Badge>
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
      </section>

      {/* 信任 · 隱私（連 P5） */}
      <section className="mt-14 rounded-token-xl border border-border bg-surface-muted p-6">
        <h2 className="text-base font-bold text-foreground">安心參賽</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <p className="text-sm text-muted-fg">
            <span className="font-semibold text-foreground">反詐提醒：</span>
            OneGo 絕不會透過電話或訊息要求你儲值、匯款或代辦退費。收到可疑訊息請勿理會。
          </p>
          <p className="text-sm text-muted-fg">
            <span className="font-semibold text-foreground">隱私保護：</span>
            公開名次榜與名單將以遮罩方式顯示姓名，未成年參賽者資料受額外保護。
          </p>
        </div>
      </section>
    </main>
  );
}
