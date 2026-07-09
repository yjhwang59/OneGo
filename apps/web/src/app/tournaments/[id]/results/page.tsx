"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { PageHeader, EmptyState, ErrorBanner, Spinner, Button } from "@/components/ui";

type Category = { key: string; displayName: string; sortOrder: number; players: number };
type ResultRow = {
  seedNo: number;
  code: string;
  rank: number | null;
  tiebreaks: (number | null)[];
  wins: number | null;
  isPlayoff: boolean;
  promotedTo: string | null;
};
type MatchRow = {
  roundNo: number;
  a: { seedNo: number; code: string };
  b: { seedNo: number; code: string };
  winnerSeed: number | null;
};

export default function GroupResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [tName, setTName] = useState<string>("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupLoading, setGroupLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 載入組別清單
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/otc/public/tournaments/${id}/official-results`, { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.message || data?.code || `HTTP ${res.status}`);
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        setTName(data?.tournament?.name ?? "");
        setCategories(Array.isArray(data?.categories) ? data.categories : []);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const loadGroup = useCallback(
    (key: string) => {
      setSelected(key);
      setGroupLoading(true);
      setResults([]);
      setMatches([]);
      fetch(`/api/otc/public/tournaments/${id}/official-results?categoryKey=${encodeURIComponent(key)}`, { cache: "no-store" })
        .then(async (res) => {
          const data = await res.json().catch(() => null);
          if (!res.ok) throw new Error(data?.message || data?.code || `HTTP ${res.status}`);
          return data;
        })
        .then((data) => {
          setResults(Array.isArray(data?.results) ? data.results : []);
          setMatches(Array.isArray(data?.matches) ? data.matches : []);
          setError(null);
        })
        .catch((e) => setError(e instanceof Error ? e.message : String(e)))
        .finally(() => setGroupLoading(false));
    },
    [id]
  );

  const rounds = [...new Set(matches.map((m) => m.roundNo))].sort((a, b) => a - b);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <PageHeader title={tName ? `${tName}：各組戰績` : "各組戰績"} />
      <div className="mb-4">
        <Link href="/results" className="text-sm text-indigo-600 hover:underline dark:text-indigo-400">
          ← 返回賽果列表
        </Link>
      </div>

      {error && (
        <div className="mb-4">
          <ErrorBanner tone="warning">{error}</ErrorBanner>
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : categories.length === 0 ? (
        <EmptyState title="尚無成績資料" />
      ) : (
        <>
          {/* 組別選擇 */}
          <div className="mb-6 flex flex-wrap gap-2">
            {categories.map((c) => (
              <Button
                key={c.key}
                variant={selected === c.key ? "primary" : "secondary"}
                onClick={() => loadGroup(c.key)}
              >
                {c.displayName}
                <span className="ml-1 text-xs opacity-70">({c.players})</span>
              </Button>
            ))}
          </div>

          {!selected ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">請選擇上方組別以查看該組名次與各輪對局。</p>
          ) : groupLoading ? (
            <Spinner />
          ) : (
            <div className="space-y-8">
              {/* 名次表 */}
              <section>
                <h2 className="mb-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">名次表</h2>
                <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
                  <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-700">
                    <thead className="bg-zinc-50 dark:bg-zinc-800/50">
                      <tr>
                        {["名次", "編號", "代碼", "勝場", "輔分1", "輔分2", "輔分3", "輔分4", "升段", "加賽"].map((h) => (
                          <th key={h} className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {results.map((r) => (
                        <tr key={r.seedNo}>
                          <td className="px-3 py-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{r.rank ?? "—"}</td>
                          <td className="px-3 py-2 text-sm text-zinc-500 dark:text-zinc-400">{r.seedNo}</td>
                          <td className="px-3 py-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">{r.code}</td>
                          <td className="px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100">{r.wins ?? "—"}</td>
                          {r.tiebreaks.map((tb, i) => (
                            <td key={i} className="px-3 py-2 text-sm text-zinc-500 dark:text-zinc-400">
                              {tb ?? "—"}
                            </td>
                          ))}
                          <td className="px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100">
                            {r.promotedTo ? (
                              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                                升 {r.promotedTo}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-3 py-2 text-sm">
                            {r.isPlayoff ? (
                              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                                加賽
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* 各輪對局 */}
              <section>
                <h2 className="mb-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">各輪對局</h2>
                {matches.length === 0 ? (
                  <EmptyState title="此組無對局資料" />
                ) : (
                  <div className="space-y-4">
                    {rounds.map((rnd) => (
                      <div key={rnd}>
                        <h3 className="mb-1 text-sm font-medium text-zinc-600 dark:text-zinc-300">第 {rnd} 輪</h3>
                        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
                          <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-700">
                            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                              {matches
                                .filter((m) => m.roundNo === rnd)
                                .map((m, i) => {
                                  const aWin = m.winnerSeed === m.a.seedNo;
                                  const bWin = m.winnerSeed === m.b.seedNo;
                                  const side = (s: { seedNo: number; code: string }, win: boolean) => (
                                    <span className={win ? "font-semibold text-emerald-700 dark:text-emerald-300" : "text-zinc-600 dark:text-zinc-400"}>
                                      #{s.seedNo} {s.code}
                                      {win && " ○"}
                                    </span>
                                  );
                                  return (
                                    <tr key={i}>
                                      <td className="px-3 py-1.5 text-sm">{side(m.a, aWin)}</td>
                                      <td className="px-2 py-1.5 text-center text-xs text-zinc-400">vs</td>
                                      <td className="px-3 py-1.5 text-right text-sm sm:text-left">{side(m.b, bWin)}</td>
                                    </tr>
                                  );
                                })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </>
      )}
    </main>
  );
}
