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
  const [standings, setStandings] = useState<Array<{ playerId: string; points: number; categoryKey?: string | null; played?: number; wins?: number }>>([]);
  const [standingsLoading, setStandingsLoading] = useState(false);
  const [registrations, setRegistrations] = useState<Array<{ userId: string; categoryKey: string | null }>>([]);
  const [registrationsLoading, setRegistrationsLoading] = useState(false);
  const [categories, setCategories] = useState<Array<{ key: string; displayName: string; capacity?: number | null }>>([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [openRegistrationGroup, setOpenRegistrationGroup] = useState<string | null>(null);
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

  useEffect(() => {
    let cancelled = false;
    if (!id) return;
    fetch(`/api/otc/public/tournaments/${id}/categories`, { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json().catch(() => []);
        return { ok: res.ok, data };
      })
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (ok && Array.isArray(data)) {
          setCategories(data);
          if (data.length > 0) setSelectedCategory(data[0].key);
        }
      });
    return () => { cancelled = true; };
  }, [id]);

  const onRegister = useCallback(async () => {
    if (!id || !userId) return;
    if (categories.length > 0 && !selectedCategory) {
      setRegisterError("請選擇組別");
      return;
    }
    setRegisterError(null);
    setRegistering(true);
    try {
      const res = await fetch(`/api/otc/tournaments/${id}/registrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-id": userId },
        body: JSON.stringify({
          userId,
          ...(categories.length > 0 ? { categoryKey: selectedCategory } : {}),
        }),
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
  }, [id, userId, router, categories, selectedCategory]);

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
              {categories.length > 0 && (
                <label className="mb-3 block text-sm">
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">選擇組別</span>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="mt-1 min-h-[44px] w-full max-w-xs rounded-lg border border-zinc-300 bg-white px-3 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                  >
                    {categories.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.displayName}{c.capacity != null ? `（上限 ${c.capacity} 人）` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              )}
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
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">先瀏覽各組人數，點選組別列即可展開選手清單。</p>
          {registrationsLoading ? (
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">載入中…</p>
          ) : registrations.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">尚無報名或賽事未開放查詢。</p>
          ) : (
            (() => {
              const byGroup = (() => {
                const map = new Map<string, { label: string; list: string[]; order: number; capacity: number | null }>();
                for (const r of registrations) {
                  const key = (r.categoryKey?.trim() || "未分組");
                  const catIndex = categories.findIndex((c) => c.key === r.categoryKey);
                  const cat = catIndex >= 0 ? categories[catIndex] : null;
                  if (!map.has(key)) {
                    map.set(key, {
                      label: cat?.displayName ?? key,
                      list: [],
                      order: catIndex >= 0 ? catIndex : 999,
                      capacity: cat?.capacity ?? null,
                    });
                  }
                  map.get(key)!.list.push(r.userId);
                }
                return Array.from(map.entries())
                  .sort((a, b) => a[1].order - b[1].order || a[1].label.localeCompare(b[1].label))
                  .map(([groupKey, value]) => ({ groupKey, ...value, list: value.list.sort((a, b) => a.localeCompare(b)) }));
              })();
              return (
                <div className="mt-3 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
                  {byGroup.map(({ groupKey, label, list, capacity }) => (
                    <div key={groupKey} className="border-b border-zinc-200 last:border-b-0 dark:border-zinc-800">
                      <button
                        type="button"
                        onClick={() => setOpenRegistrationGroup((v) => (v === groupKey ? null : groupKey))}
                        className="flex min-h-[56px] w-full items-center justify-between gap-3 bg-white px-4 py-3 text-left transition hover:bg-zinc-50 dark:bg-zinc-950 dark:hover:bg-zinc-900"
                      >
                        <span>
                          <span className="font-medium text-zinc-900 dark:text-zinc-50">{label}</span>
                          {capacity != null && <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">上限 {capacity}</span>}
                        </span>
                        <span className="flex items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400">
                          <span>{list.length} 人</span>
                          <span aria-hidden="true">{openRegistrationGroup === groupKey ? "收合" : "展開"}</span>
                        </span>
                      </button>
                      {openRegistrationGroup === groupKey && (
                        <ul className="grid gap-2 bg-zinc-50 p-4 dark:bg-zinc-900/60 sm:grid-cols-2 lg:grid-cols-3">
                          {list.map((uid, index) => (
                            <li
                              key={uid}
                              className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                            >
                              <span className="text-xs text-zinc-400">{index + 1}</span>
                              <span className="font-medium">{maskName(uid)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()
          )}
        </section>

        {/* 公開排名 */}
        <section className="mt-8 border-t border-zinc-200 pt-6 dark:border-zinc-800">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">分組成績</h2>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">先選擇組別，再查看該組瑞士制矩陣、各輪對手與名次。</p>
            </div>
            <Link
              href={`/tournaments/${id}/results`}
              className="inline-flex min-h-[40px] items-center justify-center rounded-lg border border-zinc-200 px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              全部組別
            </Link>
          </div>
          {standingsLoading ? (
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">載入中…</p>
          ) : standings.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">尚無排名資料（需有已結束的對局）。</p>
          ) : (
            <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
              {(() => {
                const categoryOrder = new Map(categories.map((c, i) => [c.key, i]));
                const registrationCounts = new Map<string, number>();
                for (const r of registrations) {
                  const key = r.categoryKey?.trim() || "未分組";
                  registrationCounts.set(key, (registrationCounts.get(key) ?? 0) + 1);
                }
                const map = new Map<string, typeof standings>();
                for (const row of standings) {
                  const key = row.categoryKey?.trim() || "未分組";
                  if (!map.has(key)) map.set(key, []);
                  map.get(key)!.push(row);
                }
                return [...map.entries()]
                  .sort((a, b) => (categoryOrder.get(a[0]) ?? 999) - (categoryOrder.get(b[0]) ?? 999) || a[0].localeCompare(b[0]))
                  .map(([groupKey, rows]) => {
                    const cat = categories.find((c) => c.key === groupKey);
                    const label = cat?.displayName ?? groupKey;
                    const sorted = [...rows].sort((a, b) => b.points - a.points || (b.wins ?? 0) - (a.wins ?? 0) || a.playerId.localeCompare(b.playerId));
                    const leader = sorted[0];
                    const played = rows.reduce((sum, row) => sum + (row.played ?? 0), 0);
                    return (
                      <Link
                        key={groupKey}
                        href={`/tournaments/${id}/results?categoryKey=${encodeURIComponent(groupKey)}`}
                        className="grid min-h-[72px] gap-2 border-b border-zinc-200 bg-white px-4 py-3 transition last:border-b-0 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900 sm:grid-cols-[1.1fr_0.55fr_0.7fr_1fr_auto] sm:items-center"
                      >
                        <div>
                          <p className="font-semibold text-zinc-900 dark:text-zinc-50">{label}</p>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400">{registrationCounts.get(groupKey) ?? rows.length} 人</p>
                        </div>
                        <div>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400">已賽局數</p>
                          <p className="font-medium text-zinc-900 dark:text-zinc-100">{Math.floor(played / 2)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400">最高分</p>
                          <p className="font-medium text-zinc-900 dark:text-zinc-100">{leader?.points ?? "—"}</p>
                        </div>
                        <div>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400">目前領先</p>
                          <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">{leader ? maskName(leader.playerId) : "—"}</p>
                        </div>
                        <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400">查看戰績 →</span>
                      </Link>
                    );
                  });
              })()}
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
