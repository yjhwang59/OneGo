"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { use, useCallback, useEffect, useState } from "react";
import { PageHeader, EmptyState, ErrorBanner, Spinner, Button } from "@/components/ui";

type Category = { key: string; displayName: string; sortOrder: number; players: number };
type SortKey = "rank" | "seed" | "name";
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialCategoryKey = searchParams.get("categoryKey");
  const [tName, setTName] = useState<string>("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [loading, setLoading] = useState(true);
  const [groupLoading, setGroupLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadGroup = useCallback(
    (key: string, opts?: { replaceUrl?: boolean }) => {
      setSelected(key);
      setGroupLoading(true);
      setResults([]);
      setMatches([]);
      if (opts?.replaceUrl !== false) {
        router.replace(`/tournaments/${id}/results?categoryKey=${encodeURIComponent(key)}`, { scroll: false });
      }
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
    [id, router]
  );

  // 載入組別清單
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/otc/public/tournaments/${id}/official-results`, { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.message || data?.code || `HTTP ${res.status}`);
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        setTName(data?.tournament?.name ?? "");
        const nextCategories = Array.isArray(data?.categories) ? data.categories : [];
        setCategories(nextCategories);
        if (initialCategoryKey && nextCategories.some((c: Category) => c.key === initialCategoryKey)) {
          loadGroup(initialCategoryKey, { replaceUrl: false });
        }
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id, initialCategoryKey, loadGroup]);

  const rounds = [...new Set(matches.map((m) => m.roundNo))].sort((a, b) => a - b);
  const matrixRows = (() => {
    const matchMap = new Map<number, Map<number, { opponent: { seedNo: number; code: string }; result: "O" | "X" | "=" | "-" }>>();
    for (const m of matches) {
      if (!matchMap.has(m.a.seedNo)) matchMap.set(m.a.seedNo, new Map());
      if (!matchMap.has(m.b.seedNo)) matchMap.set(m.b.seedNo, new Map());
      const aResult = m.winnerSeed == null ? "-" : m.winnerSeed === m.a.seedNo ? "O" : "X";
      const bResult = m.winnerSeed == null ? "-" : m.winnerSeed === m.b.seedNo ? "O" : "X";
      matchMap.get(m.a.seedNo)!.set(m.roundNo, { opponent: { seedNo: m.b.seedNo, code: "" }, result: aResult });
      matchMap.get(m.b.seedNo)!.set(m.roundNo, { opponent: { seedNo: m.a.seedNo, code: "" }, result: bResult });
    }
    return [...results].sort((a, b) => {
      if (sortKey === "seed") return a.seedNo - b.seedNo;
      if (sortKey === "name") return a.code.localeCompare(b.code) || a.seedNo - b.seedNo;
      return (a.rank ?? 9999) - (b.rank ?? 9999) || a.seedNo - b.seedNo;
    }).map((r) => ({ ...r, rounds: matchMap.get(r.seedNo) ?? new Map() }));
  })();

  return (
    <main className="mx-auto max-w-screen-2xl px-3 py-6 sm:px-5">
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
          <div className="mb-5 flex flex-wrap gap-2">
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
            <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700">
              <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-700">
                <thead className="bg-zinc-50 dark:bg-zinc-800/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400">組別</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400">人數</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {categories.map((c) => (
                    <tr key={c.key} className="bg-white dark:bg-zinc-950">
                      <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">{c.displayName}</td>
                      <td className="px-4 py-3 text-right text-zinc-600 dark:text-zinc-300">{c.players}</td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="secondary" onClick={() => loadGroup(c.key)}>查看矩陣</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : groupLoading ? (
            <Spinner />
          ) : (
            <div className="space-y-8">
              <section>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">瑞士制成績矩陣</h2>
                    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                      O 代表勝，X 代表負；每格僅顯示對手序號。
                    </p>
                  </div>
                  <label className="text-sm text-zinc-600 dark:text-zinc-300">
                    排序
                    <select
                      value={sortKey}
                      onChange={(e) => setSortKey(e.target.value as SortKey)}
                      className="ml-2 min-h-[40px] rounded-lg border border-zinc-300 bg-white px-3 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                    >
                      <option value="rank">名次</option>
                      <option value="seed">序號</option>
                      <option value="name">姓名</option>
                    </select>
                  </label>
                </div>
                <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
                  <table className="w-full min-w-[980px] table-fixed divide-y divide-zinc-200 text-[13px] dark:divide-zinc-700 xl:min-w-0">
                    <colgroup>
                      <col className="w-[54px]" />
                      <col className="w-[88px]" />
                      <col className="w-[54px]" />
                      <col className="w-[54px]" />
                      {rounds.map((r) => <col key={r} className="w-[84px]" />)}
                      <col className="w-[58px]" />
                      <col className="w-[58px]" />
                      <col className="w-[58px]" />
                      <col className="w-[58px]" />
                      <col className="w-[74px]" />
                      <col className="w-[56px]" />
                    </colgroup>
                    <thead className="bg-zinc-50 dark:bg-zinc-800/50">
                      <tr>
                        {["序號", "姓名", "名次", "勝場", ...rounds.map((r) => `第 ${r} 輪`), "輔分1", "輔分2", "輔分3", "輔分4", "升段", "加賽"].map((h) => (
                          <th key={h} className="whitespace-nowrap px-2 py-2 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {matrixRows.map((r) => (
                        <tr key={r.seedNo}>
                          <td className="px-2 py-2 text-zinc-500 dark:text-zinc-400">{r.seedNo}</td>
                          <td className="truncate px-2 py-2 font-medium text-zinc-900 dark:text-zinc-100">{r.code}</td>
                          <td className="px-2 py-2 font-semibold text-zinc-900 dark:text-zinc-100">{r.rank ?? "—"}</td>
                          <td className="px-2 py-2 text-zinc-900 dark:text-zinc-100">{r.wins ?? "—"}</td>
                          {rounds.map((roundNo) => {
                            const cell = r.rounds.get(roundNo);
                            const win = cell?.result === "O";
                            const loss = cell?.result === "X";
                            return (
                              <td key={roundNo} className="whitespace-nowrap px-2 py-2">
                                {cell ? (
                                  <span className={win ? "font-semibold text-emerald-700 dark:text-emerald-300" : loss ? "text-zinc-700 dark:text-zinc-300" : "text-zinc-500"}>
                                    {cell.result} #{cell.opponent.seedNo}
                                  </span>
                                ) : (
                                  <span className="text-zinc-400">—</span>
                                )}
                              </td>
                            );
                          })}
                          {r.tiebreaks.map((tb, i) => (
                            <td key={i} className="px-2 py-2 text-zinc-500 dark:text-zinc-400">
                              {tb ?? "—"}
                            </td>
                          ))}
                          <td className="px-2 py-2 text-zinc-900 dark:text-zinc-100">
                            {r.promotedTo ? (
                              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                                升 {r.promotedTo}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-2 py-2">
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
            </div>
          )}
        </>
      )}
    </main>
  );
}
