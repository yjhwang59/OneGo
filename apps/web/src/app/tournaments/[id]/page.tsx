"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useState } from "react";
import { useUser } from "@/contexts/UserContext";
import { maskName } from "@/lib/privacy";

type Tournament = {
  id: string;
  name: string;
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

export default function TournamentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [standings, setStandings] = useState<Array<{ playerId: string; points: number }>>([]);
  const [standingsLoading, setStandingsLoading] = useState(false);
  const [registrations, setRegistrations] = useState<Array<{ userId: string; categoryKey: string | null }>>([]);
  const [registrationsLoading, setRegistrationsLoading] = useState(false);
  const { userId, isAuthenticated } = useUser();
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/otc/public/tournaments/${id}`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data?.message || data?.error || "無法載入賽事");
          return;
        }
        setTournament(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "網路錯誤");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    if (!id) return;
    setStandingsLoading(true);
    fetch(`/api/otc/public/tournaments/${id}/standings`, { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        return { ok: res.ok, data };
      })
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (ok && Array.isArray(data)) setStandings(data);
        else setStandings([]);
      })
      .catch(() => {
        if (!cancelled) setStandings([]);
      })
      .finally(() => {
        if (!cancelled) setStandingsLoading(false);
      });
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    if (!id) return;
    setRegistrationsLoading(true);
    fetch(`/api/otc/public/tournaments/${id}/registrations`, { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        return { ok: res.ok, data };
      })
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (ok && Array.isArray(data)) setRegistrations(data);
        else setRegistrations([]);
      })
      .catch(() => {
        if (!cancelled) setRegistrations([]);
      })
      .finally(() => {
        if (!cancelled) setRegistrationsLoading(false);
      });
    return () => { cancelled = true; };
  }, [id]);

  const onRegister = useCallback(async () => {
    if (!id || !userId) return;
    setRegisterError(null);
    setRegistering(true);
    try {
      const res = await fetch(`/api/otc/tournaments/${id}/registrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-id": userId },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRegisterError(data?.message || data?.code || "報名失敗");
        return;
      }
      router.push("/me/registrations");
    } catch (e) {
      setRegisterError(e instanceof Error ? e.message : "網路錯誤");
    } finally {
      setRegistering(false);
    }
  }, [id, userId, router]);

  if (loading) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <p className="text-zinc-600 dark:text-zinc-400">載入中…</p>
      </main>
    );
  }

  if (error || !tournament) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/50">
          <p className="font-medium text-amber-800 dark:text-amber-200">
            {error ?? "賽事不存在"}
          </p>
          <Link
            href="/tournaments"
            className="mt-3 inline-flex min-h-[44px] items-center justify-center rounded-lg border border-zinc-200 px-4 text-sm font-medium dark:border-zinc-700 dark:text-zinc-300"
          >
            返回賽事列表
          </Link>
        </div>
      </main>
    );
  }

  const canRegister =
    (tournament.status === "published" || tournament.status === "checkin_open") &&
    isAuthenticated;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Link
        href="/tournaments"
        className="inline-flex min-h-[44px] items-center text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        ← 返回賽事列表
      </Link>

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950 sm:p-8">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl">
          {tournament.name}
        </h1>
        <dl className="mt-6 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-zinc-500 dark:text-zinc-400">棋種</dt>
            <dd className="font-medium text-zinc-900 dark:text-zinc-50">
              {GAME_LABEL[tournament.gameKey] ?? tournament.gameKey}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-zinc-500 dark:text-zinc-400">賽制</dt>
            <dd className="font-medium text-zinc-900 dark:text-zinc-50">
              {tournament.format} · {tournament.roundCount} 輪
            </dd>
          </div>
          <div>
            <dt className="text-sm text-zinc-500 dark:text-zinc-400">狀態</dt>
            <dd className="font-medium text-zinc-900 dark:text-zinc-50">
              {STATUS_LABEL[tournament.status] ?? tournament.status}
              {canRegister && (
                <span className="ml-2 rounded bg-green-100 px-2 py-0.5 text-xs text-green-800 dark:bg-green-900/50 dark:text-green-200">
                  可報名
                </span>
              )}
              {(tournament.status === "closed" || tournament.status === "cancelled") && (
                <span className="ml-2 rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                  {tournament.status === "closed" ? "已結束" : "已取消"}
                </span>
              )}
            </dd>
          </div>
          {tournament.startsAt && (
            <div>
              <dt className="text-sm text-zinc-500 dark:text-zinc-400">開始時間</dt>
              <dd className="font-medium text-zinc-900 dark:text-zinc-50">
                {new Date(tournament.startsAt).toLocaleString("zh-TW")}
              </dd>
            </div>
          )}
        </dl>

        <div className="mt-8">
          {!isAuthenticated ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
              請先點擊右上角「模擬登入」並輸入使用者 ID，再進行報名。
            </p>
          ) : !canRegister ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              目前賽事狀態（{STATUS_LABEL[tournament.status] ?? tournament.status}）不開放報名。
            </p>
          ) : (
            <div>
              <button
                type="button"
                onClick={onRegister}
                disabled={registering}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-zinc-900 px-6 py-3 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {registering ? "報名中…" : "我要報名"}
              </button>
              {registerError && (
                <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                  {registerError}
                </p>
              )}
            </div>
          )}
        </div>

        {/* 分組報名清單 */}
        <section className="mt-8 border-t border-zinc-200 pt-6 dark:border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">分組報名清單</h2>
          {registrationsLoading ? (
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">載入中…</p>
          ) : registrations.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">尚無報名或賽事未開放查詢。</p>
          ) : (
            (() => {
              const byGroup = (() => {
                const map = new Map<string, string[]>();
                for (const r of registrations) {
                  const key = (r.categoryKey?.trim() || "未分組");
                  if (!map.has(key)) map.set(key, []);
                  map.get(key)!.push(r.userId);
                }
                const keys = Array.from(map.keys()).sort((a, b) => {
                  if (a === "未分組") return -1;
                  if (b === "未分組") return 1;
                  return a.localeCompare(b);
                });
                return keys.map((groupKey) => ({ groupKey, list: map.get(groupKey)! }));
              })();
              return (
                <div className="mt-3 space-y-6">
                  {byGroup.map(({ groupKey, list }) => (
                    <div key={groupKey}>
                      <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                        分組：{groupKey}
                        <span className="ml-2 text-zinc-500 dark:text-zinc-400">（{list.length} 人）</span>
                      </h3>
                      <ul className="mt-2 flex flex-wrap gap-2">
                        {list.map((uid) => (
                          <li
                            key={uid}
                            className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-100"
                          >
                            {maskName(uid)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              );
            })()
          )}
        </section>

        {/* 公開排名 */}
        <section className="mt-8 border-t border-zinc-200 pt-6 dark:border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">排名</h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">為保護參賽者隱私，公開榜單姓名已部分遮罩。</p>
          {standingsLoading ? (
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">載入中…</p>
          ) : standings.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">尚無排名資料（需有已結束的對局）。</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-700">
                <thead>
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400">名次</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400">選手</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400">積分</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {[...standings]
                    .sort((a, b) => b.points - a.points)
                    .map((row, i) => (
                      <tr key={row.playerId}>
                        <td className="px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100">{i + 1}</td>
                        <td className="px-3 py-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">{maskName(row.playerId)}</td>
                        <td className="px-3 py-2 text-right text-sm text-zinc-900 dark:text-zinc-100">{row.points}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {isAuthenticated && (
          <div className="mt-6">
            <Link
              href={`/me/tournaments/${id}/matches`}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-zinc-200 px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              我的對局
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
