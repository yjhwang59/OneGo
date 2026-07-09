"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/contexts/UserContext";
import {
  PageHeader,
  Card,
  CardBody,
  Button,
  Badge,
  Spinner,
  ErrorBanner,
  EmptyState,
} from "@/components/ui";

type User = {
  id: string;
  displayName: string;
  email?: string;
  platformRole?: string | null;
  status?: string;
  avatarUrl?: string | null;
  googleLinked?: boolean;
  createdAt: string;
};

type UserListResponse = {
  items: User[];
  total: number;
  limit: number;
  offset: number;
};

const PAGE_SIZE = 20;

export default function PlatformUsersPage() {
  const { userId, isAuthenticated, platformRole } = useUser();
  const [list, setList] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [searchQ, setSearchQ] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newAdmin, setNewAdmin] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const params = new URLSearchParams();
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(offset));
      if (searchQ.trim()) params.set("q", searchQ.trim());
      const res = await fetch(`/api/otc/platform/users?${params.toString()}`, { headers: { "x-user-id": userId } });
      const text = await res.text();
      const data = text ? (() => { try { return JSON.parse(text); } catch { return null; } })() : null;
      if (!res.ok) { setError(data?.message ?? data?.code ?? "無法載入（僅平台總管可存取）"); setList([]); setTotal(0); return; }
      const page = data as UserListResponse;
      if (page && Array.isArray(page.items)) {
        setList(page.items);
        setTotal(page.total ?? page.items.length);
      } else if (Array.isArray(data)) {
        setList(data);
        setTotal(data.length);
      } else {
        setList([]);
        setTotal(0);
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "網路錯誤");
      setList([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [userId, offset, searchQ]);

  useEffect(() => {
    if (isAuthenticated && userId) load();
    else setLoading(false);
  }, [isAuthenticated, userId, load]);

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !newId.trim()) return;
    setCreating(true); setCreateError(null);
    try {
      const res = await fetch(`/api/otc/platform/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-id": userId },
        body: JSON.stringify({
          id: newId.trim(),
          displayName: newName.trim() || undefined,
          email: newEmail.trim() || null,
          platformRole: newAdmin ? "platform_admin" : null,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setNewId(""); setNewName(""); setNewEmail(""); setNewAdmin(false); setShowCreate(false);
        await load();
      } else setCreateError(data?.message ?? data?.code ?? "建立失敗");
    } finally { setCreating(false); }
  };

  if (platformRole !== "platform_admin") {
    return <ErrorBanner tone="warning">僅平台總管可檢視此頁。</ErrorBanner>;
  }

  const inputCls = "min-h-[44px] w-full rounded-token-md border border-border bg-surface px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand";

  return (
    <div>
      <PageHeader
        title="全平台用戶"
        description="可依 ID、名稱、Email 搜尋；平台總管可建立、編輯、停權或刪除帳號。"
        actions={<Button onClick={() => setShowCreate((v) => !v)}>{showCreate ? "取消" : "新增用戶"}</Button>}
      />

      {showCreate && (
        <Card className="mt-4">
          <CardBody>
            <form onSubmit={createUser} className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="font-medium text-foreground">使用者 ID（必填）</span>
                <input className={inputCls} value={newId} onChange={(e) => setNewId(e.target.value)} placeholder="例：user-100" />
              </label>
              <label className="text-sm">
                <span className="font-medium text-foreground">顯示名稱</span>
                <input className={inputCls} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="預設為 ID" />
              </label>
              <label className="text-sm">
                <span className="font-medium text-foreground">Email</span>
                <input className={inputCls} type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
              </label>
              <label className="flex items-center gap-2 self-end text-sm">
                <input type="checkbox" checked={newAdmin} onChange={(e) => setNewAdmin(e.target.checked)} className="h-4 w-4" />
                <span className="text-foreground">設為平台總管</span>
              </label>
              <div className="sm:col-span-2">
                <Button type="submit" loading={creating} disabled={!newId.trim()}>建立用戶</Button>
                {createError && <span className="ml-3 text-sm text-[var(--tone-danger-fg)]">{createError}</span>}
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      <form className="mt-4 flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); setOffset(0); setSearchQ(q); setLoading(true); }}>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋 ID、名稱、Email" className={`flex-1 ${inputCls}`} />
        <Button type="submit" variant="secondary">搜尋</Button>
      </form>

      {!loading && !error && total > 0 && (
        <p className="mt-3 text-sm text-muted-fg">
          共 {total} 位用戶
          {total > PAGE_SIZE && ` · 第 ${offset + 1}–${Math.min(offset + PAGE_SIZE, total)} 筆`}
        </p>
      )}

      {loading ? (
        <div className="mt-6 flex items-center gap-3 text-muted-fg"><Spinner /> 載入中…</div>
      ) : error ? (
        <div className="mt-6"><ErrorBanner>{error}</ErrorBanner></div>
      ) : list.length === 0 ? (
        <div className="mt-8"><EmptyState title="查無用戶。" /></div>
      ) : (
        <ul className="mt-6 space-y-2">
          {list.map((u) => (
            <li key={u.id}>
              <Link
                href={`/admin/platform/users/${encodeURIComponent(u.id)}`}
                className="flex flex-col gap-1 rounded-token-xl border border-border bg-surface p-4 shadow-token-sm transition hover:shadow-token-md sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <span className="font-medium text-foreground">{u.displayName}</span>
                  <span className="ml-2 text-sm text-muted-fg">{u.id}</span>
                </div>
                <div className="flex items-center gap-2">
                  {u.googleLinked && <Badge tone="info">Google</Badge>}
                  {u.status === "suspended" && <Badge tone="danger">已停權</Badge>}
                  {u.platformRole === "platform_admin" && <Badge tone="purple">平台總管</Badge>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {!loading && !error && total > PAGE_SIZE && (
        <div className="mt-6 flex items-center justify-between gap-2">
          <Button
            variant="secondary"
            disabled={offset === 0}
            onClick={() => { setOffset((o) => Math.max(0, o - PAGE_SIZE)); setLoading(true); }}
          >
            上一頁
          </Button>
          <span className="text-sm text-muted-fg">
            {Math.floor(offset / PAGE_SIZE) + 1} / {Math.ceil(total / PAGE_SIZE)}
          </span>
          <Button
            variant="secondary"
            disabled={offset + PAGE_SIZE >= total}
            onClick={() => { setOffset((o) => o + PAGE_SIZE); setLoading(true); }}
          >
            下一頁
          </Button>
        </div>
      )}
    </div>
  );
}
