"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useUser } from "@/contexts/UserContext";
import {
  PageHeader,
  Card,
  CardBody,
  Badge,
  Button,
  Spinner,
  ErrorBanner,
} from "@/components/ui";

type Stats = {
  counts: {
    organizations: number;
    users: number;
    tournaments: number;
    inProgressTournaments: number;
  };
  recentUsers: Array<{
    id: string;
    displayName: string;
    email: string | null;
    status: string;
    createdAt: string;
  }>;
};

export default function PlatformDashboardPage() {
  const { userId, platformRole } = useUser();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || platformRole !== "platform_admin") {
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetch("/api/otc/platform/stats", { headers: { "x-user-id": userId } })
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data?.message || data?.code || "無法載入平台統計");
          return;
        }
        setStats(data);
        setError(null);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "網路錯誤"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [userId, platformRole]);

  if (platformRole !== "platform_admin") {
    return <ErrorBanner tone="warning">僅平台總管可檢視此頁。</ErrorBanner>;
  }

  return (
    <div>
      <PageHeader title="平台總覽" description="全站營運概況與快速操作入口。" />

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

      {!loading && !error && stats && (
        <div className="mt-6 space-y-6">
          {/* 量化卡 */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="主辦單位" value={stats.counts.organizations} href="/admin/platform/organizations" />
            <StatCard label="用戶數" value={stats.counts.users} href="/admin/platform/users" />
            <StatCard label="賽事總數" value={stats.counts.tournaments} />
            <StatCard label="進行中賽事" value={stats.counts.inProgressTournaments} tone="purple" />
          </div>

          {/* 最近註冊 */}
          <Card>
            <CardBody>
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-foreground">最近註冊用戶</h2>
                <Link href="/admin/platform/users" className="text-sm text-brand-subtle-fg hover:underline">
                  管理全部 →
                </Link>
              </div>
              {stats.recentUsers.length === 0 ? (
                <p className="mt-3 text-sm text-muted-fg">尚無用戶。</p>
              ) : (
                <ul className="mt-3 divide-y divide-border">
                  {stats.recentUsers.map((u) => (
                    <li key={u.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <Link
                          href={`/admin/platform/users/${encodeURIComponent(u.id)}`}
                          className="font-medium text-foreground hover:underline"
                        >
                          {u.displayName || u.id}
                        </Link>
                        <p className="mt-0.5 truncate text-xs text-muted-fg">
                          {u.email || u.id} · {new Date(u.createdAt).toLocaleDateString("zh-TW")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {u.status === "suspended" ? (
                          <Badge tone="danger">已停權</Badge>
                        ) : (
                          <Badge tone="success">正常</Badge>
                        )}
                        <Link href={`/admin/platform/users/${encodeURIComponent(u.id)}`}>
                          <Button size="sm" variant="secondary">管理</Button>
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  href,
  tone,
}: {
  label: string;
  value: number;
  href?: string;
  tone?: "purple";
}) {
  const inner = (
    <Card className={href ? "transition hover:shadow-token-md" : undefined}>
      <CardBody>
        <p className="text-xs font-medium uppercase text-muted-fg">{label}</p>
        <p className={`mt-2 text-3xl font-bold ${tone === "purple" ? "text-[var(--tone-purple-fg)]" : "text-foreground"}`}>
          {value}
        </p>
      </CardBody>
    </Card>
  );
  return href ? <Link href={href} className="block">{inner}</Link> : inner;
}
