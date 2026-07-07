"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/contexts/UserContext";

type Organization = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
};

export default function AdminOrganizationsPage() {
  const { userId, isAuthenticated } = useUser();
  const [list, setList] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch("/api/otc/organizations", {
        headers: { "x-user-id": userId },
      });
      const text = await res.text();
      const data = text ? (() => { try { return JSON.parse(text); } catch { return null; } })() : null;
      if (!res.ok) {
        setError(data?.message ?? data?.code ?? "無法載入主辦單位");
        setList([]);
        return;
      }
      setList(Array.isArray(data) ? data : []);
      setError(null);
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

  if (loading) {
    return <p className="text-zinc-600 dark:text-zinc-400">載入主辦單位中…</p>;
  }

  if (error) {
    return (
      <div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/50">
          <p className="font-medium text-amber-800 dark:text-amber-200">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl">
          主辦單位
        </h1>
        <Link
          href="/admin/organizations/new"
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          建立主辦單位
        </Link>
      </div>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        您所屬的主辦單位；可管理成員與角色（owner / admin / staff）。
      </p>

      {list.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-zinc-200 bg-zinc-50 p-8 text-center dark:border-zinc-800 dark:bg-zinc-900/50">
          <p className="text-zinc-600 dark:text-zinc-400">尚無主辦單位。</p>
          <Link
            href="/admin/organizations/new"
            className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            建立第一個主辦單位
          </Link>
        </div>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((org) => (
            <li key={org.id}>
              <Link
                href={`/admin/organizations/${org.id}`}
                className="flex min-h-[44px] flex-col rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-zinc-300 hover:shadow dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
              >
                <span className="font-semibold text-zinc-900 dark:text-zinc-50">{org.name}</span>
                <span className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{org.slug}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
