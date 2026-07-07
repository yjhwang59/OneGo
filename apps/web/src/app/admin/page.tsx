import Link from "next/link";

export default function AdminHomePage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl">
        主辦後台
      </h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        管理賽事、報名、編排與成績。請由左側選單進入各功能。
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Link
          href="/admin/organizations"
          className="flex min-h-[44px] flex-col rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-zinc-300 hover:shadow dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
        >
          <span className="font-semibold text-zinc-900 dark:text-zinc-50">主辦單位</span>
          <span className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            建立主辦單位、管理成員與角色（owner/admin/staff）
          </span>
        </Link>
        <Link
          href="/admin/tournaments"
          className="flex min-h-[44px] flex-col rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-zinc-300 hover:shadow dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
        >
          <span className="font-semibold text-zinc-900 dark:text-zinc-50">賽事管理</span>
          <span className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            建立、編輯、發布賽事，僅草稿可編輯/刪除
          </span>
        </Link>
      </div>
    </div>
  );
}
