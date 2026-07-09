"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/contexts/UserContext";
import { Button, ConfirmDialog } from "@/components/ui";

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

export default function PlatformUserDetailPage() {
  const params = useParams();
  const id = decodeURIComponent((params.id as string) ?? "");
  const { userId, isAuthenticated, platformRole } = useUser();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPlatformRole, setEditPlatformRole] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [suspending, setSuspending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!userId || !id) return;
    try {
      const res = await fetch(`/api/otc/platform/users/${encodeURIComponent(id)}`, {
        headers: { "x-user-id": userId },
      });
      const text = await res.text();
      const data = text ? (() => { try { return JSON.parse(text); } catch { return null; } })() : null;
      if (!res.ok) {
        setError(data?.message ?? data?.code ?? "無法載入");
        setUser(null);
        return;
      }
      setUser(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "網路錯誤");
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [userId, id]);

  useEffect(() => {
    if (isAuthenticated && userId && id) load();
    else setLoading(false);
  }, [isAuthenticated, userId, id, load]);

  useEffect(() => {
    if (user) {
      setEditDisplayName(user.displayName);
      setEditEmail(user.email ?? "");
      setEditPlatformRole(user.platformRole ?? "");
    }
  }, [user]);

  const handleSave = useCallback(async () => {
    if (!userId || !id || !user) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/otc/platform/users/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-user-id": userId },
        body: JSON.stringify({
          displayName: editDisplayName.trim() || undefined,
          email: editEmail.trim() || null,
          platformRole: editPlatformRole === "platform_admin" ? "platform_admin" : null,
        }),
      });
      const text = await res.text();
      const data = text ? (() => { try { return JSON.parse(text); } catch { return null; } })() : null;
      if (!res.ok) {
        setSaveError(data?.message ?? data?.code ?? "儲存失敗");
        return;
      }
      setUser(data);
      setEditing(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "網路錯誤");
    } finally {
      setSaving(false);
    }
  }, [userId, id, user, editDisplayName, editEmail, editPlatformRole]);

  const doToggleSuspend = useCallback(async () => {
    if (!userId || !id || !user) return;
    const nextStatus = user.status === "suspended" ? "active" : "suspended";
    setSuspending(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/otc/platform/users/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-user-id": userId },
        body: JSON.stringify({ status: nextStatus }),
      });
      const text = await res.text();
      const data = text ? (() => { try { return JSON.parse(text); } catch { return null; } })() : null;
      if (!res.ok) {
        setSaveError(data?.message ?? data?.code ?? "操作失敗");
        return;
      }
      setUser(data);
      setConfirmOpen(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "網路錯誤");
    } finally {
      setSuspending(false);
    }
  }, [userId, id, user]);

  const isSuspended = user?.status === "suspended";

  const doDelete = useCallback(async () => {
    if (!userId || !id) return;
    setDeleting(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/otc/platform/users/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { "x-user-id": userId },
      });
      if (res.ok) {
        window.location.href = "/admin/platform/users";
        return;
      }
      const text = await res.text();
      const data = text ? (() => { try { return JSON.parse(text); } catch { return null; } })() : null;
      setSaveError(data?.message ?? data?.code ?? "刪除失敗");
      setConfirmDelete(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "網路錯誤");
    } finally {
      setDeleting(false);
    }
  }, [userId, id]);

  if (platformRole !== "platform_admin") {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/50">
        <p className="font-medium text-amber-800 dark:text-amber-200">僅平台總管可檢視此頁。</p>
      </div>
    );
  }

  if (loading) return <p className="text-zinc-600 dark:text-zinc-400">載入中…</p>;
  if (error || !user) {
    return (
      <div>
        <p className="text-amber-700 dark:text-amber-300">{error ?? "找不到用戶"}</p>
        <Link
          href="/admin/platform/users"
          className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-xl border border-zinc-200 px-4 text-sm font-medium dark:border-zinc-700 dark:text-zinc-300"
        >
          返回列表
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          {user.avatarUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.avatarUrl}
              alt=""
              className="h-14 w-14 rounded-full border border-zinc-200 object-cover dark:border-zinc-700"
            />
          )}
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl">
            {user.displayName}
          </h1>
        </div>
        {!editing ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              編輯
            </button>
            {id !== userId && (
              <>
                <Button
                  variant={isSuspended ? "secondary" : "danger"}
                  onClick={() => setConfirmOpen(true)}
                  loading={suspending}
                >
                  {isSuspended ? "解除停權" : "停權"}
                </Button>
                <Button variant="ghost" onClick={() => setConfirmDelete(true)} loading={deleting}>
                  刪除
                </Button>
              </>
            )}
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {saving ? "儲存中…" : "儲存"}
            </button>
            <button
              type="button"
              onClick={() => { setEditing(false); setSaveError(null); }}
              disabled={saving}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-zinc-200 px-4 text-sm font-medium dark:border-zinc-700 dark:text-zinc-300"
            >
              取消
            </button>
          </div>
        )}
      </div>

      {!editing && saveError && (
        <p className="mt-4 rounded-lg bg-amber-50 p-2 text-sm text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
          {saveError}
        </p>
      )}

      {editing ? (
        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => { e.preventDefault(); handleSave(); }}
        >
          {saveError && (
            <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
              {saveError}
            </p>
          )}
          <div>
            <label htmlFor="edit-displayName" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              顯示名稱
            </label>
            <input
              id="edit-displayName"
              type="text"
              value={editDisplayName}
              onChange={(e) => setEditDisplayName(e.target.value)}
              className="mt-1 min-h-[44px] w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 sm:max-w-md"
            />
          </div>
          <div>
            <label htmlFor="edit-email" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Email
            </label>
            <input
              id="edit-email"
              type="email"
              value={editEmail}
              onChange={(e) => setEditEmail(e.target.value)}
              className="mt-1 min-h-[44px] w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 sm:max-w-md"
            />
          </div>
          <div>
            <label htmlFor="edit-platformRole" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              平台角色
            </label>
            <select
              id="edit-platformRole"
              value={editPlatformRole}
              onChange={(e) => setEditPlatformRole(e.target.value)}
              className="mt-1 min-h-[44px] w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 sm:max-w-md"
            >
              <option value="">一般</option>
              <option value="platform_admin">平台總管 (platform_admin)</option>
            </select>
          </div>
        </form>
      ) : (
        <dl className="mt-4 space-y-2 text-sm">
          <div>
            <dt className="text-zinc-500 dark:text-zinc-400">ID</dt>
            <dd className="font-mono text-zinc-900 dark:text-zinc-50">{user.id}</dd>
          </div>
          {user.email != null && user.email !== "" && (
            <div>
              <dt className="text-zinc-500 dark:text-zinc-400">Email</dt>
              <dd>{user.email}</dd>
            </div>
          )}
          {user.platformRole && (
            <div>
              <dt className="text-zinc-500 dark:text-zinc-400">平台角色</dt>
              <dd>{user.platformRole}</dd>
            </div>
          )}
          <div>
            <dt className="text-zinc-500 dark:text-zinc-400">Google 登入</dt>
            <dd>{user.googleLinked ? "已綁定" : "未綁定"}</dd>
          </div>
          <div>
            <dt className="text-zinc-500 dark:text-zinc-400">帳號狀態</dt>
            <dd>
              {user.status === "suspended" ? (
                <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950/50 dark:text-red-300">
                  已停權
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                  正常
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500 dark:text-zinc-400">建立時間</dt>
            <dd>{user.createdAt ? new Date(user.createdAt).toLocaleString() : "—"}</dd>
          </div>
        </dl>
      )}

      {id === userId && (
        <p className="mt-6 text-xs text-muted-fg">為防呆，無法停權自己的帳號。</p>
      )}

      <Link
        href="/admin/platform/users"
        className="mt-8 inline-flex min-h-[44px] items-center justify-center rounded-xl border border-zinc-200 px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        返回全平台用戶列表
      </Link>

      <ConfirmDialog
        open={confirmOpen}
        title={isSuspended ? "解除停權" : "停權帳號"}
        description={
          isSuspended ? (
            <span>
              將恢復「{user.displayName}」的帳號存取權，該用戶可再次登入使用所有功能。
            </span>
          ) : (
            <span>
              停權「{user.displayName}」後，該帳號呼叫任何需登入的 API 會被擋下（<code>403 ACCOUNT_SUSPENDED</code>）。
              <span className="mt-2 block text-xs">此操作將即時生效，並記錄於稽核用途；可隨時解除。</span>
            </span>
          )
        }
        confirmLabel={isSuspended ? "解除停權" : "確定停權"}
        danger={!isSuspended}
        loading={suspending}
        onConfirm={doToggleSuspend}
        onCancel={() => { if (!suspending) setConfirmOpen(false); }}
      />

      <ConfirmDialog
        open={confirmDelete}
        title="刪除帳號"
        description={
          <span>
            將永久刪除「{user.displayName}」帳號。若該用戶仍有主辦成員／賽事角色／報名紀錄，將無法刪除（請先移除關聯或改用停權）。
          </span>
        }
        confirmLabel="確定刪除"
        danger
        loading={deleting}
        onConfirm={doDelete}
        onCancel={() => { if (!deleting) setConfirmDelete(false); }}
      />
    </div>
  );
}
