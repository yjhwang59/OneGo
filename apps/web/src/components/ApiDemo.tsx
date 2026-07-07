"use client";

import { useEffect, useState } from "react";

type HealthResponse = { ok: boolean; upstream?: unknown; error?: string; hint?: string };
type PublicTournamentsResponse = { ok: boolean; upstream?: unknown; error?: string; hint?: string };

export function ApiDemo() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [tournaments, setTournaments] = useState<PublicTournamentsResponse | null>(null);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const [h, t] = await Promise.all([
        fetch("/api/otc/health", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/otc/public-tournaments", { cache: "no-store" }).then((r) => r.json()),
      ]);
      setHealth(h);
      setTournaments(t);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-medium text-zinc-900 dark:text-zinc-50">API 連線展示（同源代理，避免 CORS）</div>
          <div className="text-sm text-zinc-600 dark:text-zinc-400">
            透過 Next Route Handler 轉呼叫 OTC API（可用環境變數 <code className="font-mono">OTC_API_BASE</code> 設定）。
          </div>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="inline-flex items-center justify-center rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {loading ? "更新中…" : "重新整理"}
        </button>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">/api/health</div>
          <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-zinc-50 p-3 text-xs text-zinc-700 dark:bg-black dark:text-zinc-200">
            {JSON.stringify(health, null, 2)}
          </pre>
        </div>

        <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">/api/public/tournaments</div>
          <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-zinc-50 p-3 text-xs text-zinc-700 dark:bg-black dark:text-zinc-200">
            {JSON.stringify(tournaments, null, 2)}
          </pre>
        </div>
      </div>
    </section>
  );
}

