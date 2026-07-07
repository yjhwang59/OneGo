"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/contexts/UserContext";

type Organization = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
};

export default function PlatformOrganizationDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { userId, isAuthenticated, platformRole } = useUser();
  const [org, setOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId || !id) return;
    try {
      const res = await fetch(`/api/otc/platform/organizations/${id}`, {
        headers: { "x-user-id": userId },
      });
      const text = await res.text();
      const data = text ? (() => { try { return JSON.parse(text); } catch { return null; } })() : null;
      if (!res.ok) {
        setError(data?.message ?? data?.code ?? "無法載入");
        setOrg(null);
        return;
      }
      setOrg(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "網路錯誤");
      setOrg(null);
    } finally {
      setLoading(false);
    }
  }, [userId, id]);

  useEffect(() => {
    if (isAuthenticated && userId && id) load();
    else setLoading(false);
  }, [isAuthenticated, userId, id, load]);

  if (platformRole !== "platform_admin") {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/50">
        <p className="font-medium text-amber-800 dark:text-amber-200">僅平台總管可檢視此頁。</p>
      </div>
    );
  }

  if (loading) return <p className="text-zinc-600 dark:text-zinc-400">載入中…</p>;
  if (error || !org) {
    return (
      <div>
        <p className="text-amber-700 dark:text-amber-300">{error ?? "找不到主辦單位"}</p>
        <Link
          href="/admin/platform/organizations"
          className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-xl border border-zinc-200 px-4 text-sm font-medium dark:border-zinc-700 dark:text-zinc-300"
        >
          返回列表
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl">
        {org.name}
      </h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{org.slug}</p>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        建立於 {org.createdAt ? new Date(org.createdAt).toLocaleString() : "—"}
      </p>
      <Link
        href="/admin/platform/organizations"
        className="mt-8 inline-flex min-h-[44px] items-center justify-center rounded-xl border border-zinc-200 px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        返回全平台主辦列表
      </Link>
    </div>
  );
}
