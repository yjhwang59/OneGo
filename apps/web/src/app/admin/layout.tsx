"use client";

import Link from "next/link";
import { useState } from "react";
import { AdminSidebar } from "@/components/AdminSidebar";
import { useUser } from "@/contexts/UserContext";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated } = useUser();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (!isAuthenticated) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-800 dark:bg-amber-950/50">
          <p className="font-medium text-amber-800 dark:text-amber-200">
            請先模擬登入以使用主辦後台。
          </p>
          <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
            點擊右上角「模擬登入」並輸入使用者 ID（需為主辦單位成員）。
          </p>
          <Link
            href="/"
            className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            返回首頁
          </Link>
        </div>
      </main>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-0px)]">
      {/* 桌面：固定側邊欄 */}
      <aside
        className="hidden w-56 shrink-0 border-r border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/50 lg:block"
        aria-label="主辦後台側邊選單"
      >
        <AdminSidebar className="sticky top-20" />
      </aside>

      {/* 手機：漢堡按鈕 + 抽屜 */}
      <div className="fixed left-0 top-[57px] z-30 flex min-h-[44px] min-w-[44px] items-center justify-center border-r border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 lg:hidden">
        <button
          type="button"
          onClick={() => setSidebarOpen((o) => !o)}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          aria-label={sidebarOpen ? "關閉選單" : "開啟選單"}
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      {sidebarOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 lg:hidden"
            aria-hidden
            onClick={() => setSidebarOpen(false)}
          />
          <aside
            className="fixed left-0 top-[57px] z-50 w-56 border-r border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-800 dark:bg-zinc-950 lg:hidden"
            aria-label="主辦後台選單（浮動）"
          >
            <AdminSidebar onNavigate={() => setSidebarOpen(false)} />
          </aside>
        </>
      )}

      {/* 主內容區 */}
      <main className="min-w-0 flex-1 pl-12 lg:pl-0">
        <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  );
}
