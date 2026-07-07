"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useUser } from "@/contexts/UserContext";

export default function AdminOrganizationsNewPage() {
  const router = useRouter();
  const { userId, isAuthenticated } = useUser();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !name.trim() || !slug.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/otc/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-id": userId },
        body: JSON.stringify({ name: name.trim(), slug: slug.trim() }),
      });
      const text = await res.text();
      const data = text ? (() => { try { return JSON.parse(text); } catch { return null; } })() : null;
      if (res.ok && data?.id) {
        router.push(`/admin/organizations/${data.id}`);
        return;
      }
      setError(data?.message ?? data?.code ?? "建立失敗");
    } catch (e) {
      setError(e instanceof Error ? e.message : "網路錯誤");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div>
        <p className="text-amber-700 dark:text-amber-300">請先模擬登入。</p>
        <Link href="/admin" className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-xl border px-4 text-sm">
          返回後台
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl">
        建立主辦單位
      </h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        建立後您將自動成為該主辦單位的 owner。
      </p>

      <form onSubmit={handleSubmit} className="mt-6 max-w-md space-y-4">
        {error && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
            {error}
          </div>
        )}
        <div>
          <label htmlFor="org-name" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            名稱
          </label>
          <input
            id="org-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2.5 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            placeholder="例：台灣圍棋協會"
          />
        </div>
        <div>
          <label htmlFor="org-slug" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            代碼（英文、網址用）
          </label>
          <input
            id="org-slug"
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
            required
            className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2.5 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            placeholder="例：taiwan-go-assoc"
          />
        </div>
        <div className="flex min-h-[44px] gap-3">
          <button
            type="submit"
            disabled={submitting || !name.trim() || !slug.trim()}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-zinc-900 px-5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {submitting ? "建立中…" : "建立"}
          </button>
          <Link
            href="/admin/organizations"
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-zinc-200 px-5 text-sm font-medium dark:border-zinc-700 dark:text-zinc-300"
          >
            取消
          </Link>
        </div>
      </form>
    </div>
  );
}
