"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { useUser } from "@/contexts/UserContext";
import { canAccessAdmin, isPlatformAdmin, isReferee } from "@/lib/roles";
import { useState } from "react";

const navLink =
  "inline-flex min-h-[44px] items-center justify-center rounded-token-md px-3 text-sm font-medium text-foreground/80 hover:bg-surface-muted hover:text-foreground";

export function AppHeader() {
  const user = useUser();
  const { userId, setUserId, isAuthenticated, fromSession, displayName } = user;
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const [myOpen, setMyOpen] = useState(false);

  const signals = {
    platformRole: user.platformRole,
    orgRoles: user.orgRoles,
    isReferee: user.isReferee,
  };
  const showAdmin = isAuthenticated && canAccessAdmin(signals);
  const showReferee = isAuthenticated && isReferee(signals);
  const showPlatform = isAuthenticated && isPlatformAdmin(signals);

  const handleSave = () => {
    const v = input.trim();
    setUserId(v || null);
    setOpen(false);
  };

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex min-h-[44px] items-center gap-3">
          <Link
            href="/"
            className="text-lg font-bold tracking-tight text-foreground"
          >
            OneGo OTC
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2">
            <Link href="/tournaments" className={navLink}>
              瀏覽賽事
            </Link>

            {/* 參賽者：我的（下拉：報名·對局·戰績） */}
            {isAuthenticated && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMyOpen((o) => !o)}
                  className={navLink}
                  aria-expanded={myOpen}
                >
                  我的 <span className="ml-1 text-muted-fg">▾</span>
                </button>
                {myOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      aria-hidden
                      onClick={() => setMyOpen(false)}
                    />
                    <div className="absolute left-0 top-full z-20 mt-1 w-44 rounded-token-lg border border-border bg-surface p-1 shadow-token-md">
                      <Link
                        href="/me/registrations"
                        onClick={() => setMyOpen(false)}
                        className="block rounded-token-sm px-3 py-2.5 text-sm text-foreground hover:bg-surface-muted"
                      >
                        我的報名
                      </Link>
                    </div>
                  </>
                )}
              </div>
            )}

            {showAdmin && (
              <Link href="/admin" className={navLink}>
                主辦後台
              </Link>
            )}
            {showReferee && (
              <Link href="/referee" className={navLink}>
                計分
              </Link>
            )}
            {showPlatform && (
              <Link href="/admin/platform" className={navLink}>
                平台管理
              </Link>
            )}
          </nav>
        </div>

        <div className="relative flex min-h-[44px] items-center gap-2">
          {isAuthenticated ? (
            <>
              <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-token-md border border-border px-3 py-2 text-sm text-foreground"
                aria-expanded={open}
              >
                <span className="max-w-[120px] truncate sm:max-w-[180px]" title={userId ?? undefined}>
                  {fromSession ? (displayName || userId) : userId}
                </span>
                <span className="text-muted-fg">▼</span>
              </button>
              {open && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    aria-hidden
                    onClick={() => setOpen(false)}
                  />
                  <div className="absolute right-0 top-full z-20 mt-1 w-56 rounded-token-lg border border-border bg-surface p-3 shadow-token-md">
                    {fromSession ? (
                      <p className="text-xs text-muted-fg">Google 帳號</p>
                    ) : (
                      <p className="text-xs text-muted-fg">MVP 模擬登入（開發用）</p>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (fromSession) signOut();
                        else {
                          setUserId(null);
                          setInput("");
                        }
                        setOpen(false);
                      }}
                      className="mt-2 inline-flex min-h-[44px] w-full items-center justify-center rounded-token-md bg-surface-muted text-sm font-medium text-foreground hover:opacity-80"
                    >
                      登出
                    </button>
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="inline-flex min-h-[44px] items-center justify-center rounded-token-md bg-brand px-4 py-2 text-sm font-semibold text-brand-fg hover:bg-brand-hover"
              >
                登入
              </Link>
              <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-token-md border border-border px-3 py-2 text-xs text-muted-fg"
                title="開發用模擬登入"
              >
                模擬
              </button>
              {open && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    aria-hidden
                    onClick={() => setOpen(false)}
                  />
                  <div
                    className="absolute right-0 top-full z-20 mt-1 w-64 rounded-token-lg border border-border bg-surface p-3 shadow-token-md"
                    style={{ minWidth: "min(100vw - 2rem, 256px)" }}
                  >
                    <p className="text-xs text-muted-fg">
                      輸入使用者 ID（開發用，例如：player-01）
                    </p>
                    <input
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSave()}
                      placeholder="player-01"
                      className="mt-2 w-full rounded-token-md border border-border bg-surface px-3 py-2.5 text-sm text-foreground"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={handleSave}
                      className="mt-2 inline-flex min-h-[44px] w-full items-center justify-center rounded-token-md bg-brand text-sm font-semibold text-brand-fg hover:bg-brand-hover"
                    >
                      確定
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </header>
  );
}
