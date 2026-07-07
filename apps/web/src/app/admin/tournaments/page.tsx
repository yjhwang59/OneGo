"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/contexts/UserContext";

type Tournament = {
  id: string;
  name: string;
  organizationId: string;
  gameKey: string;
  rulesetVersion: string;
  format: string;
  roundCount: number;
  status: string;
  timezone?: string;
  startsAt?: string;
  endsAt?: string;
};

const GAME_LABEL: Record<string, string> = {
  go: "圍棋",
  chess: "西洋棋",
  xiangqi: "象棋",
  gomoku: "五子棋",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  published: "已發布",
  checkin_open: "開放報到",
  pairing_ready: "鎖定編排",
  in_progress: "進行中",
  closed: "已結束",
  cancelled: "已取消",
};

export default function AdminTournamentsPage() {
  const { userId, isAuthenticated } = useUser();
  const [list, setList] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch("/api/otc/tournaments", {
        headers: { "x-user-id": userId },
      });
      const text = await res.text();
      const data = text ? (() => { try { return JSON.parse(text); } catch { return null; } })() : null;
      if (!res.ok) {
        setError(data?.message ?? data?.code ?? "無法載入賽事列表");
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
    return (
      <div>
        <p className="text-zinc-600 dark:text-zinc-400">載入賽事中…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/50">
          <p className="font-medium text-amber-800 dark:text-amber-200">{error}</p>
          <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
            請確認 API 已啟動且此使用者為主辦單位成員。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl">
          賽事管理
        </h1>
        <Link
          href="/admin/tournaments/new"
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          建立賽事
        </Link>
      </div>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        您有管理權的賽事；僅草稿可編輯或刪除。
      </p>

      {list.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-zinc-200 bg-zinc-50 p-8 text-center dark:border-zinc-800 dark:bg-zinc-900/50">
          <p className="text-zinc-600 dark:text-zinc-400">尚無賽事。</p>
          <Link
            href="/admin/tournaments/new"
            className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            建立第一場賽事
          </Link>
        </div>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((t) => (
            <li key={t.id}>
              <Link
                href={`/admin/tournaments/${t.id}`}
                className="flex min-h-[44px] flex-col rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-zinc-300 hover:shadow dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
              >
                <span className="font-semibold text-zinc-900 dark:text-zinc-50">
                  {t.name}
                </span>
                <span className="mt-1 inline-flex flex-wrap items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">
                    {GAME_LABEL[t.gameKey] ?? t.gameKey}
                  </span>
                  <span>{t.format}</span>
                  <span>{t.roundCount} 輪</span>
                </span>
                <span className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
                  狀態：{STATUS_LABEL[t.status] ?? t.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
