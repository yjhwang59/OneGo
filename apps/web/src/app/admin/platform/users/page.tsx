"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUser } from "@/contexts/UserContext";
import {
  PageHeader,
  Button,
  Badge,
  Spinner,
  ErrorBanner,
  EmptyState,
  Modal,
  ConfirmDialog,
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

// ── 欄位設定（可顯示/隱藏；持久化於 localStorage）────────────────
type ColKey = "id" | "email" | "platformRole" | "status" | "google" | "createdAt";
const COLUMNS: { key: ColKey; label: string; sortable: boolean }[] = [
  { key: "id", label: "ID", sortable: true },
  { key: "email", label: "Email", sortable: true },
  { key: "platformRole", label: "平台角色", sortable: true },
  { key: "status", label: "狀態", sortable: true },
  { key: "google", label: "Google", sortable: false },
  { key: "createdAt", label: "建立時間", sortable: true },
];
const DEFAULT_COLS: Record<ColKey, boolean> = {
  id: true,
  email: true,
  platformRole: true,
  status: true,
  google: false,
  createdAt: true,
};
const COLS_STORAGE_KEY = "otc.platform.users.columns";

// ── 排序（用戶端排序目前頁）────────────────────────────────────
type SortKey = "displayName" | "id" | "email" | "platformRole" | "status" | "createdAt";
type SortDir = "asc" | "desc";

function sortUsers(list: User[], key: SortKey, dir: SortDir): User[] {
  const factor = dir === "asc" ? 1 : -1;
  const val = (u: User): string => {
    switch (key) {
      case "displayName": return u.displayName ?? "";
      case "id": return u.id ?? "";
      case "email": return u.email ?? "";
      case "platformRole": return u.platformRole ?? "";
      case "status": return u.status ?? "active";
      case "createdAt": return u.createdAt ?? "";
    }
  };
  return [...list].sort((a, b) => val(a).localeCompare(val(b), "zh-Hant") * factor);
}

const inputCls =
  "min-h-[44px] w-full rounded-token-md border border-border bg-surface px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand";

// ── 用戶表單（新增 / 編輯共用）──────────────────────────────────
type FormState = { id: string; displayName: string; email: string; admin: boolean };

function UserFormFields({
  mode,
  form,
  onChange,
}: {
  mode: "create" | "edit";
  form: FormState;
  onChange: (patch: Partial<FormState>) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm sm:col-span-2">
        <span className="font-medium text-foreground">
          使用者 ID{mode === "create" ? "（必填）" : ""}
        </span>
        <input
          className={`mt-1 ${inputCls} ${mode === "edit" ? "cursor-not-allowed opacity-60" : ""}`}
          value={form.id}
          onChange={(e) => onChange({ id: e.target.value })}
          placeholder="例：user-100"
          readOnly={mode === "edit"}
          autoFocus={mode === "create"}
        />
      </label>
      <label className="text-sm">
        <span className="font-medium text-foreground">顯示名稱</span>
        <input
          className={`mt-1 ${inputCls}`}
          value={form.displayName}
          onChange={(e) => onChange({ displayName: e.target.value })}
          placeholder={mode === "create" ? "預設為 ID" : ""}
        />
      </label>
      <label className="text-sm">
        <span className="font-medium text-foreground">Email</span>
        <input
          className={`mt-1 ${inputCls}`}
          type="email"
          value={form.email}
          onChange={(e) => onChange({ email: e.target.value })}
        />
      </label>
      <label className="flex items-center gap-2 self-end pb-2 text-sm sm:col-span-2">
        <input
          type="checkbox"
          checked={form.admin}
          onChange={(e) => onChange({ admin: e.target.checked })}
          className="h-4 w-4"
        />
        <span className="text-foreground">設為平台總管（platform_admin）</span>
      </label>
    </div>
  );
}

export default function PlatformUsersPage() {
  const { userId, isAuthenticated, platformRole } = useUser();
  const [list, setList] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [searchQ, setSearchQ] = useState("");

  // 排序
  const [sortKey, setSortKey] = useState<SortKey>("displayName");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // 欄位設定
  const [cols, setCols] = useState<Record<ColKey, boolean>>(DEFAULT_COLS);
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const colMenuRef = useRef<HTMLDivElement>(null);

  // CRUD modal
  const [modalMode, setModalMode] = useState<null | "create" | "edit">(null);
  const [form, setForm] = useState<FormState>({ id: "", displayName: "", email: "", admin: false });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // 停權 / 刪除 目標
  const [suspendTarget, setSuspendTarget] = useState<User | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  // 讀取欄位設定
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLS_STORAGE_KEY);
      if (raw) setCols({ ...DEFAULT_COLS, ...JSON.parse(raw) });
    } catch { /* ignore */ }
  }, []);
  const toggleCol = (key: ColKey) => {
    setCols((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem(COLS_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  // 點外部關閉欄位選單
  useEffect(() => {
    if (!colMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) setColMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [colMenuOpen]);

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

  const sorted = useMemo(() => sortUsers(list, sortKey, sortDir), [list, sortKey, sortDir]);

  const onSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  // ── 新增 / 編輯 ────────────────────────────────────────────
  const openCreate = () => {
    setForm({ id: "", displayName: "", email: "", admin: false });
    setFormError(null);
    setModalMode("create");
  };
  const openEdit = (u: User) => {
    setForm({
      id: u.id,
      displayName: u.displayName ?? "",
      email: u.email ?? "",
      admin: u.platformRole === "platform_admin",
    });
    setFormError(null);
    setModalMode("edit");
  };

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    if (modalMode === "create" && !form.id.trim()) return;
    setSaving(true);
    setFormError(null);
    try {
      const isCreate = modalMode === "create";
      const url = isCreate
        ? `/api/otc/platform/users`
        : `/api/otc/platform/users/${encodeURIComponent(form.id)}`;
      const body = isCreate
        ? {
            id: form.id.trim(),
            displayName: form.displayName.trim() || undefined,
            email: form.email.trim() || null,
            platformRole: form.admin ? "platform_admin" : null,
          }
        : {
            displayName: form.displayName.trim() || undefined,
            email: form.email.trim() || null,
            platformRole: form.admin ? "platform_admin" : null,
          };
      const res = await fetch(url, {
        method: isCreate ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json", "x-user-id": userId },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      const data = text ? (() => { try { return JSON.parse(text); } catch { return null; } })() : null;
      if (!res.ok) {
        setFormError(data?.message ?? data?.code ?? (isCreate ? "建立失敗" : "儲存失敗"));
        return;
      }
      setModalMode(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "網路錯誤");
    } finally {
      setSaving(false);
    }
  };

  // ── 停權 / 解除停權 ────────────────────────────────────────
  const doToggleSuspend = async () => {
    if (!userId || !suspendTarget) return;
    const nextStatus = suspendTarget.status === "suspended" ? "active" : "suspended";
    setActionLoading(true);
    setRowError(null);
    try {
      const res = await fetch(`/api/otc/platform/users/${encodeURIComponent(suspendTarget.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-user-id": userId },
        body: JSON.stringify({ status: nextStatus }),
      });
      const text = await res.text();
      const data = text ? (() => { try { return JSON.parse(text); } catch { return null; } })() : null;
      if (!res.ok) { setRowError(data?.message ?? data?.code ?? "操作失敗"); return; }
      setSuspendTarget(null);
      await load();
    } catch (err) {
      setRowError(err instanceof Error ? err.message : "網路錯誤");
    } finally {
      setActionLoading(false);
    }
  };

  // ── 刪除 ───────────────────────────────────────────────────
  const doDelete = async () => {
    if (!userId || !deleteTarget) return;
    setActionLoading(true);
    setRowError(null);
    try {
      const res = await fetch(`/api/otc/platform/users/${encodeURIComponent(deleteTarget.id)}`, {
        method: "DELETE",
        headers: { "x-user-id": userId },
      });
      if (!res.ok) {
        const text = await res.text();
        const data = text ? (() => { try { return JSON.parse(text); } catch { return null; } })() : null;
        setRowError(data?.message ?? data?.code ?? "刪除失敗");
        return;
      }
      setDeleteTarget(null);
      // 若刪除後本頁空了且非第一頁，往前一頁
      if (list.length === 1 && offset > 0) { setOffset((o) => Math.max(0, o - PAGE_SIZE)); setLoading(true); }
      else await load();
    } catch (err) {
      setRowError(err instanceof Error ? err.message : "網路錯誤");
    } finally {
      setActionLoading(false);
    }
  };

  if (platformRole !== "platform_admin") {
    return <ErrorBanner tone="warning">僅平台總管可檢視此頁。</ErrorBanner>;
  }

  const pageStart = total > 0 ? offset + 1 : 0;
  const pageEnd = Math.min(offset + PAGE_SIZE, total);

  const RowActions = ({ u }: { u: User }) => (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <Button size="sm" variant="secondary" onClick={() => openEdit(u)}>編輯</Button>
      {u.id !== userId && (
        <>
          <Button
            size="sm"
            variant={u.status === "suspended" ? "secondary" : "danger"}
            onClick={() => { setRowError(null); setSuspendTarget(u); }}
          >
            {u.status === "suspended" ? "解除停權" : "停權"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setRowError(null); setDeleteTarget(u); }}>刪除</Button>
        </>
      )}
      <Link
        href={`/admin/platform/users/${encodeURIComponent(u.id)}`}
        className="inline-flex min-h-[36px] items-center rounded-token-md px-3 text-sm font-semibold text-brand hover:bg-surface-muted"
      >
        檢視
      </Link>
    </div>
  );

  const RoleAndStatus = ({ u }: { u: User }) => (
    <div className="flex flex-wrap items-center gap-1.5">
      {u.googleLinked && cols.google && <Badge tone="info">Google</Badge>}
      {u.status === "suspended" ? <Badge tone="danger">已停權</Badge> : <Badge tone="success">正常</Badge>}
      {u.platformRole === "platform_admin" && <Badge tone="purple">平台總管</Badge>}
    </div>
  );

  return (
    <div>
      <PageHeader
        title="全平台用戶"
        description="可依 ID、名稱、Email 搜尋；平台總管可建立、編輯、停權或刪除帳號。"
        actions={<Button onClick={openCreate}>新增用戶</Button>}
      />

      {/* 工具列：搜尋 + 欄位設定 */}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <form
          className="flex flex-1 items-center gap-2"
          onSubmit={(e) => { e.preventDefault(); setOffset(0); setSearchQ(q); setLoading(true); }}
        >
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜尋 ID、名稱、Email"
            className={`flex-1 ${inputCls}`}
          />
          <Button type="submit" variant="secondary">搜尋</Button>
        </form>

        <div ref={colMenuRef} className="relative">
          <Button variant="secondary" onClick={() => setColMenuOpen((v) => !v)}>欄位設定</Button>
          {colMenuOpen && (
            <div className="absolute right-0 z-20 mt-1 w-52 rounded-token-md border border-border bg-surface p-2 shadow-token-md">
              <p className="px-2 py-1 text-xs font-medium text-muted-fg">顯示欄位</p>
              {COLUMNS.map((c) => (
                <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded-token-md px-2 py-1.5 text-sm hover:bg-surface-muted">
                  <input type="checkbox" checked={cols[c.key]} onChange={() => toggleCol(c.key)} className="h-4 w-4" />
                  <span className="text-foreground">{c.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {!loading && !error && total > 0 && (
        <p className="mt-3 text-sm text-muted-fg">
          共 {total} 位用戶
          {total > PAGE_SIZE && ` · 第 ${pageStart}–${pageEnd} 筆（排序僅適用本頁）`}
        </p>
      )}

      {rowError && <div className="mt-3"><ErrorBanner>{rowError}</ErrorBanner></div>}

      {loading ? (
        <div className="mt-6 flex items-center gap-3 text-muted-fg"><Spinner /> 載入中…</div>
      ) : error ? (
        <div className="mt-6"><ErrorBanner>{error}</ErrorBanner></div>
      ) : sorted.length === 0 ? (
        <div className="mt-8"><EmptyState title="查無用戶。" /></div>
      ) : (
        <>
          {/* 桌機：資料表 */}
          <div className="mt-6 hidden overflow-x-auto rounded-token-xl border border-border md:block">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-muted text-left text-muted-fg">
                  <Th label="用戶" sortKey="displayName" active={sortKey} dir={sortDir} onSort={onSort} />
                  {cols.id && <Th label="ID" sortKey="id" active={sortKey} dir={sortDir} onSort={onSort} />}
                  {cols.email && <Th label="Email" sortKey="email" active={sortKey} dir={sortDir} onSort={onSort} />}
                  {cols.platformRole && <Th label="平台角色" sortKey="platformRole" active={sortKey} dir={sortDir} onSort={onSort} />}
                  {cols.status && <Th label="狀態" sortKey="status" active={sortKey} dir={sortDir} onSort={onSort} />}
                  {cols.createdAt && <Th label="建立時間" sortKey="createdAt" active={sortKey} dir={sortDir} onSort={onSort} />}
                  <th className="px-4 py-3 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((u) => (
                  <tr key={u.id} className="border-b border-border last:border-0 hover:bg-surface-muted/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {u.avatarUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={u.avatarUrl} alt="" className="h-8 w-8 rounded-full border border-border object-cover" />
                        )}
                        <span className="font-medium text-foreground">{u.displayName}</span>
                        {u.id === userId && <Badge tone="neutral">你</Badge>}
                      </div>
                    </td>
                    {cols.id && <td className="px-4 py-3 font-mono text-xs text-muted-fg">{u.id}</td>}
                    {cols.email && <td className="px-4 py-3 text-muted-fg">{u.email || "—"}</td>}
                    {cols.platformRole && (
                      <td className="px-4 py-3">
                        {u.platformRole === "platform_admin" ? <Badge tone="purple">平台總管</Badge> : <span className="text-muted-fg">一般</span>}
                      </td>
                    )}
                    {cols.status && (
                      <td className="px-4 py-3">
                        {u.status === "suspended" ? <Badge tone="danger">已停權</Badge> : <Badge tone="success">正常</Badge>}
                        {cols.google && u.googleLinked && <Badge tone="info" className="ml-1">Google</Badge>}
                      </td>
                    )}
                    {cols.createdAt && (
                      <td className="px-4 py-3 text-muted-fg">
                        {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}
                      </td>
                    )}
                    <td className="px-4 py-3"><RowActions u={u} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 手機：卡片清單 */}
          <ul className="mt-6 space-y-2 md:hidden">
            {sorted.map((u) => (
              <li key={u.id} className="rounded-token-xl border border-border bg-surface p-4 shadow-token-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{u.displayName}</span>
                      {u.id === userId && <Badge tone="neutral">你</Badge>}
                    </div>
                    <p className="mt-0.5 font-mono text-xs text-muted-fg">{u.id}</p>
                    {u.email && <p className="mt-0.5 text-sm text-muted-fg">{u.email}</p>}
                  </div>
                  <RoleAndStatus u={u} />
                </div>
                <div className="mt-3 border-t border-border pt-3"><RowActions u={u} /></div>
              </li>
            ))}
          </ul>
        </>
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

      {/* 新增 / 編輯 Modal */}
      <Modal
        open={modalMode !== null}
        title={modalMode === "create" ? "新增用戶" : "編輯用戶"}
        description={modalMode === "edit" ? form.id : undefined}
        onClose={() => { if (!saving) setModalMode(null); }}
        loading={saving}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalMode(null)} disabled={saving}>取消</Button>
            <Button
              onClick={submitForm}
              loading={saving}
              disabled={modalMode === "create" && !form.id.trim()}
            >
              {modalMode === "create" ? "建立用戶" : "儲存變更"}
            </Button>
          </>
        }
      >
        <form onSubmit={submitForm}>
          {modalMode && (
            <UserFormFields
              mode={modalMode}
              form={form}
              onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
            />
          )}
          {formError && <p className="mt-3 text-sm text-[var(--tone-danger-fg)]">{formError}</p>}
          {/* 讓 Enter 可送出 */}
          <button type="submit" className="hidden" aria-hidden />
        </form>
      </Modal>

      {/* 停權 / 解除停權 */}
      <ConfirmDialog
        open={suspendTarget !== null}
        title={suspendTarget?.status === "suspended" ? "解除停權" : "停權帳號"}
        description={
          suspendTarget?.status === "suspended" ? (
            <span>將恢復「{suspendTarget?.displayName}」的帳號存取權，該用戶可再次登入使用所有功能。</span>
          ) : (
            <span>
              停權「{suspendTarget?.displayName}」後，該帳號呼叫任何需登入的 API 會被擋下（<code>403 ACCOUNT_SUSPENDED</code>）。
              <span className="mt-2 block text-xs">此操作即時生效，可隨時解除。</span>
            </span>
          )
        }
        confirmLabel={suspendTarget?.status === "suspended" ? "解除停權" : "確定停權"}
        danger={suspendTarget?.status !== "suspended"}
        loading={actionLoading}
        onConfirm={doToggleSuspend}
        onCancel={() => { if (!actionLoading) setSuspendTarget(null); }}
      />

      {/* 刪除 */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="刪除帳號"
        description={
          <span>
            將永久刪除「{deleteTarget?.displayName}」帳號。若該用戶仍有主辦成員／賽事角色／報名紀錄，將無法刪除（請先移除關聯或改用停權）。
          </span>
        }
        confirmLabel="確定刪除"
        danger
        loading={actionLoading}
        onConfirm={doDelete}
        onCancel={() => { if (!actionLoading) setDeleteTarget(null); }}
      />
    </div>
  );
}

// ── 可排序表頭 ─────────────────────────────────────────────────
function Th({
  label,
  sortKey,
  active,
  dir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  active: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const isActive = active === sortKey;
  return (
    <th className="px-4 py-3 font-medium">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 hover:text-foreground"
      >
        {label}
        <span aria-hidden className={isActive ? "text-foreground" : "text-muted-fg/40"}>
          {isActive ? (dir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}
