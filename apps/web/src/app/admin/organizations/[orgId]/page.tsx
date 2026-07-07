"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  ConfirmDialog,
} from "@/components/ui";
import { ORG_ROLE_LABEL } from "@/lib/labels";

type Organization = { id: string; name: string; slug: string; createdAt: string };
type Member = {
  id: string;
  organizationId: string;
  userId: string;
  role: "owner" | "admin" | "staff";
  createdAt: string;
};

const ROLES: ("owner" | "admin" | "staff")[] = ["owner", "admin", "staff"];

export default function AdminOrganizationDetailPage() {
  const params = useParams();
  const orgId = params.orgId as string;
  const { userId, isAuthenticated, platformRole } = useUser();
  const [org, setOrg] = useState<Organization | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addUserId, setAddUserId] = useState("");
  const [addRole, setAddRole] = useState<"owner" | "admin" | "staff">("staff");
  const [adding, setAdding] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<Member | null>(null);

  const ownerCount = useMemo(() => members.filter((m) => m.role === "owner").length, [members]);
  const callerRole = useMemo(() => members.find((m) => m.userId === userId)?.role ?? null, [members, userId]);
  const canManage = platformRole === "platform_admin" || callerRole === "owner" || callerRole === "admin";

  const loadOrg = useCallback(async () => {
    if (!userId || !orgId) return;
    const res = await fetch(`/api/otc/organizations/${orgId}`, { headers: { "x-user-id": userId } });
    const text = await res.text();
    const data = text ? (() => { try { return JSON.parse(text); } catch { return null; } })() : null;
    if (!res.ok) { setError(data?.message ?? data?.code ?? "無法載入主辦單位"); setOrg(null); return; }
    setOrg(data); setError(null);
  }, [userId, orgId]);

  const loadMembers = useCallback(async () => {
    if (!userId || !orgId) return;
    const res = await fetch(`/api/otc/organizations/${orgId}/members`, { headers: { "x-user-id": userId } });
    const data = await res.json().catch(() => []);
    setMembers(res.ok && Array.isArray(data) ? data : []);
  }, [userId, orgId]);

  useEffect(() => {
    if (!isAuthenticated || !userId || !orgId) { setLoading(false); return; }
    setLoading(true);
    Promise.all([loadOrg(), loadMembers()]).finally(() => setLoading(false));
  }, [isAuthenticated, userId, orgId, loadOrg, loadMembers]);

  const addMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !orgId || !addUserId.trim()) return;
    setAdding(true); setActionError(null);
    try {
      const res = await fetch(`/api/otc/organizations/${orgId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-id": userId },
        body: JSON.stringify({ userId: addUserId.trim(), role: addRole }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) { setAddUserId(""); setAddRole("staff"); await loadMembers(); }
      else setActionError(data?.message ?? data?.code ?? "新增失敗");
    } finally { setAdding(false); }
  };

  const changeRole = async (m: Member, role: "owner" | "admin" | "staff") => {
    if (!userId || role === m.role) return;
    setBusyId(m.id); setActionError(null);
    try {
      const res = await fetch(`/api/otc/organizations/${orgId}/members/${m.id}/events/change-role`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-id": userId },
        body: JSON.stringify({ role }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) await loadMembers();
      else setActionError(data?.message ?? data?.code ?? "變更角色失敗");
    } finally { setBusyId(null); }
  };

  const removeMember = async (m: Member) => {
    if (!userId) return;
    setBusyId(m.id); setActionError(null);
    try {
      const res = await fetch(`/api/otc/organizations/${orgId}/members/${m.id}`, {
        method: "DELETE",
        headers: { "x-user-id": userId },
      });
      if (res.ok) { setConfirmRemove(null); await loadMembers(); }
      else {
        const data = await res.json().catch(() => null);
        setActionError(data?.message ?? data?.code ?? "移除失敗");
      }
    } finally { setBusyId(null); }
  };

  if (loading) return <div className="flex items-center gap-3 text-muted-fg"><Spinner /> 載入中…</div>;
  if (error || !org) {
    return (
      <div>
        <ErrorBanner tone="warning">{error ?? "找不到主辦單位"}</ErrorBanner>
        <Link href="/admin/organizations" className="mt-4 inline-block text-sm text-brand-subtle-fg hover:underline">← 返回主辦單位列表</Link>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={org.name}
        description={<span className="font-mono text-xs">{org.slug}</span>}
        actions={
          <Link href="/admin/tournaments"><Button variant="secondary">前往賽事管理</Button></Link>
        }
      />

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-foreground">成員與角色</h2>
        <p className="mt-1 text-sm text-muted-fg">
          角色僅限「此主辦單位」：擁有者可管理成員、編輯/刪除主辦；管理員可管理成員與賽事；工作人員僅一般存取。
          {!canManage && "（您的角色僅可檢視）"}
        </p>

        {actionError && <div className="mt-4"><ErrorBanner>{actionError}</ErrorBanner></div>}

        {canManage && (
          <Card className="mt-4">
            <CardBody>
              <form onSubmit={addMember} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <label className="flex-1 text-sm">
                  <span className="font-medium text-foreground">使用者 ID</span>
                  <input
                    type="text"
                    value={addUserId}
                    onChange={(e) => setAddUserId(e.target.value)}
                    placeholder="例：user-002"
                    className="mt-1 min-h-[44px] w-full rounded-token-md border border-border bg-surface px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                </label>
                <label className="text-sm sm:w-40">
                  <span className="font-medium text-foreground">角色</span>
                  <select
                    value={addRole}
                    onChange={(e) => setAddRole(e.target.value as "owner" | "admin" | "staff")}
                    className="mt-1 min-h-[44px] w-full rounded-token-md border border-border bg-surface px-3 text-sm text-foreground"
                  >
                    {ROLES.map((r) => <option key={r} value={r}>{ORG_ROLE_LABEL[r]}</option>)}
                  </select>
                </label>
                <Button type="submit" loading={adding} disabled={!addUserId.trim()}>新增成員</Button>
              </form>
            </CardBody>
          </Card>
        )}

        {members.length === 0 ? (
          <div className="mt-4"><EmptyState title="尚無成員。" description="建立主辦者會自動成為擁有者。" /></div>
        ) : (
          <ul className="mt-4 space-y-2">
            {members.map((m) => {
              const isLastOwner = m.role === "owner" && ownerCount <= 1;
              const isSelf = m.userId === userId;
              return (
                <li key={m.id} className="flex flex-col gap-2 rounded-token-lg border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{m.userId}</span>
                    <Badge tone={m.role === "owner" ? "info" : m.role === "admin" ? "purple" : "neutral"}>
                      {ORG_ROLE_LABEL[m.role]}
                    </Badge>
                    {isSelf && <span className="text-xs text-muted-fg">（你）</span>}
                  </div>
                  {canManage && (
                    <div className="flex flex-wrap items-center gap-2">
                      {m.role !== "owner" && (
                        <Button size="sm" variant="secondary" onClick={() => changeRole(m, "owner")} loading={busyId === m.id}>
                          設為擁有者
                        </Button>
                      )}
                      <select
                        value={m.role}
                        onChange={(e) => changeRole(m, e.target.value as "owner" | "admin" | "staff")}
                        disabled={busyId === m.id || isLastOwner}
                        aria-label={`變更 ${m.userId} 的角色`}
                        title={isLastOwner ? "不可降級最後一位擁有者" : undefined}
                        className="min-h-[44px] rounded-token-md border border-border bg-surface px-3 text-sm text-foreground disabled:opacity-50"
                      >
                        {ROLES.map((r) => <option key={r} value={r}>{ORG_ROLE_LABEL[r]}</option>)}
                      </select>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => setConfirmRemove(m)}
                        disabled={busyId === m.id || isLastOwner}
                        title={isLastOwner ? "不可移除最後一位擁有者" : undefined}
                      >
                        移除
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Link href="/admin/organizations" className="mt-8 inline-block text-sm text-brand-subtle-fg hover:underline">← 返回主辦單位列表</Link>

      <ConfirmDialog
        open={!!confirmRemove}
        title="移除成員"
        description={confirmRemove ? <span>將移除成員「{confirmRemove.userId}」在此主辦單位的角色。</span> : ""}
        confirmLabel="確定移除"
        danger
        loading={busyId === confirmRemove?.id}
        onConfirm={() => confirmRemove && removeMember(confirmRemove)}
        onCancel={() => { if (!busyId) setConfirmRemove(null); }}
      />
    </div>
  );
}
