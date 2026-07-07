"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/contexts/UserContext";

type Organization = { id: string; name: string; slug: string };

const GAME_LABEL: Record<string, string> = {
  go: "圍棋",
  chess: "西洋棋",
  xiangqi: "象棋",
  gomoku: "五子棋",
};
const GAME_KEYS = ["go", "chess", "xiangqi", "gomoku"] as const;

/** 本地時間 yyyy-MM-ddThh:mm 轉成 ISO（供 API） */
function localToISO(local: string): string {
  return local ? new Date(local).toISOString() : "";
}

export default function AdminTournamentsNewPage() {
  const router = useRouter();
  const { userId, isAuthenticated } = useUser();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    organizationId: "",
    name: "",
    gameKey: "go" as string,
    rulesetVersion: "v1",
    timezone: "Asia/Taipei",
    format: "swiss",
    roundCount: 3,
    startsAt: "",
    endsAt: "",
  });

  const loadOrgs = useCallback(async () => {
    if (!userId) return;
    const res = await fetch("/api/otc/organizations", { headers: { "x-user-id": userId } });
    const data = await res.json().catch(() => []);
    if (res.ok && Array.isArray(data)) {
      setOrganizations(data);
      if (data.length > 0 && !form.organizationId) setForm((f) => ({ ...f, organizationId: data[0].id }));
    }
  }, [userId]);

  useEffect(() => {
    if (isAuthenticated && userId) loadOrgs();
    else setLoading(false);
  }, [isAuthenticated, userId, loadOrgs]);

  useEffect(() => {
    if (organizations.length > 0 && !form.organizationId) setForm((f) => ({ ...f, organizationId: organizations[0].id }));
  }, [organizations, form.organizationId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !form.organizationId || !form.name.trim()) {
      setError("請填寫主辦單位與賽事名稱");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const body = {
        organizationId: form.organizationId,
        name: form.name.trim(),
        gameKey: form.gameKey,
        rulesetVersion: form.rulesetVersion || "v1",
        timezone: form.timezone || "UTC",
        format: form.format.trim() || "swiss",
        roundCount: form.roundCount >= 1 ? form.roundCount : 3,
        startsAt: form.startsAt ? localToISO(form.startsAt) : undefined,
        endsAt: form.endsAt ? localToISO(form.endsAt) : undefined,
      };
      const res = await fetch("/api/otc/tournaments", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-id": userId },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.id) {
        router.push(`/admin/tournaments/${data.id}`);
        return;
      }
      setError(data?.message ?? data?.code ?? "建立失敗");
    } catch (e) {
      setError(e instanceof Error ? e.message : "網路錯誤");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <p className="text-zinc-600 dark:text-zinc-400">載入中…</p>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl">
        建立賽事
      </h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        每場賽事都應設定起迄日期時間，供排程與衝突檢查使用。
      </p>

      {organizations.length === 0 && (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/50">
          <p className="text-amber-800 dark:text-amber-200">請先建立或加入主辦單位，再建立賽事。</p>
          <Link
            href="/admin/organizations"
            className="mt-3 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-amber-600 px-4 text-sm font-medium text-white hover:bg-amber-700"
          >
            前往主辦單位
          </Link>
        </div>
      )}

      {organizations.length > 0 && (
        <form onSubmit={handleSubmit} className="mt-6 max-w-2xl space-y-6">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200">
              {error}
            </div>
          )}
          <div className="grid gap-4 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="org" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">主辦單位</label>
              <select
                id="org"
                required
                value={form.organizationId}
                onChange={(e) => setForm((f) => ({ ...f, organizationId: e.target.value }))}
                className="mt-1 min-h-[44px] w-full rounded-lg border border-zinc-300 bg-white px-3 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              >
                {organizations.map((o) => (
                  <option key={o.id} value={o.id}>{o.name} ({o.slug})</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="name" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">賽事名稱</label>
              <input
                id="name"
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="mt-1 min-h-[44px] w-full rounded-lg border border-zinc-300 bg-white px-3 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>
            <div>
              <label htmlFor="gameKey" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">棋種</label>
              <select
                id="gameKey"
                value={form.gameKey}
                onChange={(e) => setForm((f) => ({ ...f, gameKey: e.target.value }))}
                className="mt-1 min-h-[44px] w-full rounded-lg border border-zinc-300 bg-white px-3 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              >
                {GAME_KEYS.map((k) => (
                  <option key={k} value={k}>{GAME_LABEL[k]}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="format" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">賽制</label>
              <input
                id="format"
                type="text"
                value={form.format}
                onChange={(e) => setForm((f) => ({ ...f, format: e.target.value }))}
                placeholder="swiss"
                className="mt-1 min-h-[44px] w-full rounded-lg border border-zinc-300 bg-white px-3 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>
            <div>
              <label htmlFor="roundCount" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">輪次數</label>
              <input
                id="roundCount"
                type="number"
                min={1}
                value={form.roundCount}
                onChange={(e) => setForm((f) => ({ ...f, roundCount: parseInt(e.target.value, 10) || 1 }))}
                className="mt-1 min-h-[44px] w-full rounded-lg border border-zinc-300 bg-white px-3 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>
            <div>
              <label htmlFor="timezone" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">時區</label>
              <input
                id="timezone"
                type="text"
                value={form.timezone}
                onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
                placeholder="Asia/Taipei"
                className="mt-1 min-h-[44px] w-full rounded-lg border border-zinc-300 bg-white px-3 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>
            <div>
              <label htmlFor="startsAt" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">開始時間</label>
              <input
                id="startsAt"
                type="datetime-local"
                value={form.startsAt}
                onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
                className="mt-1 min-h-[44px] w-full rounded-lg border border-zinc-300 bg-white px-3 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>
            <div>
              <label htmlFor="endsAt" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">結束時間</label>
              <input
                id="endsAt"
                type="datetime-local"
                value={form.endsAt}
                onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))}
                className="mt-1 min-h-[44px] w-full rounded-lg border border-zinc-300 bg-white px-3 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-zinc-900 px-5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {submitting ? "建立中…" : "建立賽事"}
            </button>
            <Link
              href="/admin/tournaments"
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-zinc-200 px-5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              取消
            </Link>
          </div>
        </form>
      )}

      <Link
        href="/admin/tournaments"
        className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-xl border border-zinc-200 px-5 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        返回賽事列表
      </Link>
    </div>
  );
}
