"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { use, useCallback, useEffect, useState } from "react";
import { useUser } from "@/contexts/UserContext";

type Match = {
  id: string;
  tournamentId: string;
  roundNo: number;
  tableNo?: number | null;
  playerAId: string;
  playerBId: string;
  status: string;
  result?: { kind: string; winner?: string } | null;
  createdAt: string;
  updatedAt: string;
};

type Tournament = {
  id: string;
  name: string;
  gameKey: string;
  status: string;
};

export default function MyTournamentMatchesPage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = use(params);
  const { userId, isAuthenticated } = useUser();
  const [matches, setMatches] = useState<Match[]>([]);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId || !tournamentId) return;
    try {
      const [matchesRes, tournamentRes] = await Promise.all([
        fetch(`/api/otc/me/tournaments/${tournamentId}/matches`, { headers: { "x-user-id": userId } }),
        fetch(`/api/otc/public/tournaments/${tournamentId}`, { cache: "no-store" }),
      ]);
      const matchesData = await matchesRes.json().catch(() => []);
      const tournamentData = await tournamentRes.json().catch(() => null);
      if (matchesRes.ok && Array.isArray(matchesData)) setMatches(matchesData);
      else setMatches([]);
      if (tournamentRes.ok && tournamentData?.id) setTournament(tournamentData);
      else setTournament(null);
      setError(matchesRes.ok ? null : (matchesData?.message ?? matchesData?.code ?? "無法載入對局"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "網路錯誤");
      setMatches([]);
      setTournament(null);
    } finally {
      setLoading(false);
    }
  }, [userId, tournamentId]);

  useEffect(() => {
    if (isAuthenticated && userId && tournamentId) load();
    else setLoading(false);
  }, [isAuthenticated, userId, tournamentId, load]);

  if (!isAuthenticated) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-800 dark:bg-amber-950/50">
          <p className="font-medium text-amber-800 dark:text-amber-200">請先模擬登入以查看「我的對局」。</p>
          <Link
            href="/tournaments"
            className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-xl border border-zinc-200 px-4 text-sm font-medium dark:border-zinc-700 dark:text-zinc-300"
          >
            返回賽事列表
          </Link>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <p className="text-zinc-600 dark:text-zinc-400">載入中…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/50">
          <p className="font-medium text-amber-800 dark:text-amber-200">{error}</p>
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

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Link
        href={`/tournaments/${tournamentId}`}
        className="inline-flex min-h-[44px] items-center text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        ← 返回賽事
      </Link>

      <h1 className="mt-6 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl">
        我的對局
      </h1>
      {tournament && (
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{tournament.name}</p>
      )}

      {matches.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-zinc-200 bg-zinc-50 p-8 text-center dark:border-zinc-800 dark:bg-zinc-900/50">
          <p className="text-zinc-600 dark:text-zinc-400">您在此賽事尚無對局紀錄。</p>
          <Link
            href={`/tournaments/${tournamentId}`}
            className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            查看賽事
          </Link>
        </div>
      ) : (
        <ul className="mt-6 space-y-4">
          {matches.map((m) => (
            <li
              key={m.id}
              className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                第 {m.roundNo} 輪{m.tableNo != null && ` · 桌 ${m.tableNo}`}
              </p>
              <p className="mt-1 font-medium text-zinc-900 dark:text-zinc-100">
                {m.playerAId} vs {m.playerBId}
              </p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                狀態：{m.status === "finished" ? "已結束" : m.status === "scheduled" ? "已排定" : m.status}
                {m.status === "finished" && m.result && (
                  <span className="ml-2">
                    · 結果：{m.result.kind}
                    {m.result.kind === "win" && m.result.winner && ` (${m.result.winner} 勝)`}
                  </span>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
