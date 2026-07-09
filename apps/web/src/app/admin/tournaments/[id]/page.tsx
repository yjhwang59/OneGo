"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useUser } from "@/contexts/UserContext";
import {
  PageHeader,
  Card,
  CardBody,
  Button,
  Badge,
  StatusBadge,
  GameBadge,
  Spinner,
  ErrorBanner,
  EmptyState,
  ConfirmDialog,
} from "@/components/ui";
import {
  GAME_LABEL,
  TOURNAMENT_STATUS,
  TOURNAMENT_ROLE_LABEL,
  statusMeta,
  gameLabel,
} from "@/lib/labels";
import { cn } from "@/lib/cn";

type Tournament = {
  id: string;
  name: string;
  organizationId: string;
  gameKey: string;
  rulesetVersion: string;
  format: string;
  roundCount: number;
  status: string;
  timezone?: string;
  startsAt?: string | null;
  endsAt?: string | null;
};
type Registration = {
  id: string;
  tournamentId: string;
  userId: string;
  status: string;
  categoryKey?: string | null;
  createdAt: string;
  updatedAt: string;
};
type Match = {
  id: string;
  tournamentId: string;
  roundNo: number;
  tableNo?: number | null;
  categoryKey?: string | null;
  playerAId: string;
  playerBId: string;
  status: string;
  result?: { kind: string; winner?: string } | null;
};
type StandingsRow = {
  playerId: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  categoryKey?: string | null;
};
type TournamentCategory = {
  id: string;
  key: string;
  displayName: string;
  sortOrder: number;
  capacity?: number | null;
};
type TournamentRole = { id: string; userId: string; role: string };
type CheckInEntry = { registrationId: string; status: string };

const GAME_KEYS = ["go", "chess", "xiangqi", "gomoku"] as const;

// 狀態機順序與每一步的推進動作（呼叫既有 events/*）
const FLOW: { status: string }[] = [
  { status: "draft" },
  { status: "published" },
  { status: "checkin_open" },
  { status: "pairing_ready" },
  { status: "in_progress" },
  { status: "closed" },
];

const NEXT_ACTION: Record<string, { label: string; path: string; hint: string }> = {
  draft: { label: "發布賽事", path: "publish", hint: "發布後將出現在公開賽事列表並開放報名。" },
  published: { label: "開放報到", path: "open-checkin", hint: "開放後可於現場為選手報到／退賽調整。" },
  checkin_open: { label: "鎖定名單並可編排", path: "lock-for-pairing", hint: "鎖定後名單凍結，開始產生對局編排。" },
  pairing_ready: { label: "開始賽事", path: "start", hint: "開始後即可上傳各輪成績。" },
  in_progress: { label: "結束賽事", path: "close", hint: "結算成績並封存，之後不可再更動。" },
};

const CANCELLABLE = new Set(["draft", "published", "checkin_open", "pairing_ready"]);

function toLocalDatetimeLocal(iso: string | undefined | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fmtDateTime(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" });
}

type TabId = "overview" | "registrations" | "checkin" | "pairing" | "standings" | "roles";

export default function AdminTournamentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { userId, isAuthenticated, platformRole } = useUser();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [callerOrgRole, setCallerOrgRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("overview");

  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [checkins, setCheckins] = useState<Record<string, string>>({});
  const [matches, setMatches] = useState<Match[]>([]);
  const [standings, setStandings] = useState<StandingsRow[]>([]);
  const [categories, setCategories] = useState<TournamentCategory[]>([]);
  const [roles, setRoles] = useState<TournamentRole[]>([]);

  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingEvent, setPendingEvent] = useState<{ path: string; label: string; danger?: boolean; hint?: string } | null>(null);
  const [eventBusy, setEventBusy] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Tournament>>({});
  const [savingEdit, setSavingEdit] = useState(false);

  const manageable = platformRole === "platform_admin" || callerOrgRole === "owner" || callerOrgRole === "admin";
  const checkinOperable = manageable || callerOrgRole === "staff";

  const load = useCallback(async () => {
    if (!userId || !id) return;
    try {
      const res = await fetch(`/api/otc/tournaments/${id}`, { headers: { "x-user-id": userId } });
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      if (!res.ok) {
        setError(data?.message ?? data?.code ?? "無法載入賽事");
        setTournament(null);
        return;
      }
      setTournament(data);
      setEditForm({
        name: data.name,
        gameKey: data.gameKey,
        rulesetVersion: data.rulesetVersion,
        timezone: data.timezone,
        format: data.format,
        roundCount: data.roundCount,
        startsAt: data.startsAt ?? undefined,
        endsAt: data.endsAt ?? undefined,
      });
      setError(null);
      // 取得呼叫者在此主辦單位的角色，用於前端動作顯示（與後端 rbac 一致）
      try {
        const mRes = await fetch(`/api/otc/organizations/${data.organizationId}/members`, { headers: { "x-user-id": userId } });
        if (mRes.ok) {
          const members = await mRes.json();
          const mine = Array.isArray(members) ? members.find((m: { userId: string }) => m.userId === userId) : null;
          setCallerOrgRole(mine?.role ?? null);
        }
      } catch {
        /* 無法取得會員資訊時，退回僅平台總管可管理 */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "網路錯誤");
      setTournament(null);
    } finally {
      setLoading(false);
    }
  }, [userId, id]);

  const loadList = useCallback(
    async (path: string, setter: (v: never[]) => void) => {
      if (!userId || !id) return;
      const res = await fetch(`/api/otc/tournaments/${id}/${path}`, { headers: { "x-user-id": userId } });
      const data = await res.json().catch(() => []);
      if (res.ok && Array.isArray(data)) setter(data as never[]);
    },
    [userId, id]
  );

  const loadRegistrations = useCallback(() => loadList("registrations", setRegistrations as (v: never[]) => void), [loadList]);
  const loadMatches = useCallback(() => loadList("matches", setMatches as (v: never[]) => void), [loadList]);
  const loadStandings = useCallback(() => loadList("standings", setStandings as (v: never[]) => void), [loadList]);
  const loadCategories = useCallback(async () => {
    if (!userId || !id) return;
    const res = await fetch(`/api/otc/tournaments/${id}/categories`, { headers: { "x-user-id": userId } });
    const data = await res.json().catch(() => []);
    if (res.ok && Array.isArray(data)) setCategories(data);
  }, [userId, id]);
  const loadRoles = useCallback(() => loadList("roles", setRoles as (v: never[]) => void), [loadList]);
  const loadCheckins = useCallback(async () => {
    if (!userId || !id) return;
    const res = await fetch(`/api/otc/tournaments/${id}/checkins`, { headers: { "x-user-id": userId } });
    const data: CheckInEntry[] = await res.json().catch(() => []);
    if (res.ok && Array.isArray(data)) {
      setCheckins(Object.fromEntries(data.map((c) => [c.registrationId, c.status])));
    }
  }, [userId, id]);

  useEffect(() => {
    if (isAuthenticated && userId && id) load();
    else setLoading(false);
  }, [isAuthenticated, userId, id, load]);

  useEffect(() => {
    if (!tournament || !userId) return;
    if (tab === "overview") loadCategories();
    if (tab === "registrations") loadRegistrations();
    if (tab === "checkin") { loadRegistrations(); loadCheckins(); loadCategories(); }
    if (tab === "pairing") loadMatches();
    if (tab === "standings") { loadStandings(); loadCategories(); }
    if (tab === "roles") loadRoles();
  }, [tournament, userId, tab, loadRegistrations, loadCheckins, loadMatches, loadStandings, loadCategories, loadRoles]);

  const runEvent = useCallback(async () => {
    if (!userId || !id || !pendingEvent) return;
    setEventBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/otc/tournaments/${id}/events/${pendingEvent.path}`, {
        method: "POST",
        headers: { "x-user-id": userId },
      });
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      if (res.ok) {
        setPendingEvent(null);
        await load();
      } else setActionError(data?.message ?? data?.code ?? `${pendingEvent.label}失敗`);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "網路錯誤");
    } finally {
      setEventBusy(false);
    }
  }, [userId, id, pendingEvent, load]);

  const handleSaveEdit = useCallback(async () => {
    if (!userId || !id) return;
    setSavingEdit(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/otc/tournaments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-user-id": userId },
        body: JSON.stringify(editForm),
      });
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      if (res.ok) await load();
      else setActionError(data?.message ?? data?.code ?? "更新失敗");
    } finally {
      setSavingEdit(false);
    }
  }, [userId, id, editForm, load]);

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-muted-fg">
        <Spinner /> 載入中…
      </div>
    );
  }
  if (error || !tournament) {
    return (
      <div>
        <ErrorBanner tone="warning">{error ?? "找不到賽事"}</ErrorBanner>
        <Link href="/admin/tournaments" className="mt-4 inline-block text-sm text-brand-subtle-fg hover:underline">
          ← 返回賽事列表
        </Link>
      </div>
    );
  }

  const next = NEXT_ACTION[tournament.status];
  const isDraft = tournament.status === "draft";
  const canPair = tournament.status === "pairing_ready" || tournament.status === "in_progress";

  const TABS: { id: TabId; label: string }[] = [
    { id: "overview", label: "總覽" },
    { id: "registrations", label: "報名" },
    { id: "checkin", label: "報到" },
    { id: "pairing", label: "編排與對局" },
    { id: "standings", label: "成績與排名" },
    ...(manageable ? [{ id: "roles" as TabId, label: "角色" }] : []),
  ];

  return (
    <div>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {tournament.name}
            <StatusBadge domain="tournament" value={tournament.status} />
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-2">
            <GameBadge gameKey={tournament.gameKey} />
            <span>{tournament.format} · {tournament.roundCount} 輪</span>
            {!manageable && callerOrgRole === "staff" && <Badge tone="muted">工作人員（報到／改組）</Badge>}
            {!manageable && callerOrgRole !== "staff" && <Badge tone="muted">唯讀</Badge>}
          </span>
        }
        actions={
          <Link href={`/tournaments/${id}`}>
            <Button variant="secondary">公開頁</Button>
          </Link>
        }
      />

      {/* 狀態機進度條 */}
      <div className="mt-6">
        <Stepper status={tournament.status} />
      </div>

      {/* 下一步動作（僅可管理者） */}
      {manageable && (next || CANCELLABLE.has(tournament.status)) && (
        <Card className="mt-4">
          <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">下一步</p>
              <p className="mt-1 text-sm text-muted-fg">{next ? next.hint : "此賽事已結束或已取消。"}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {next && (
                <Button onClick={() => setPendingEvent({ path: next.path, label: next.label, hint: next.hint })}>
                  {next.label}
                </Button>
              )}
              {CANCELLABLE.has(tournament.status) && (
                <Button
                  variant="danger"
                  onClick={() => setPendingEvent({ path: "cancel", label: "取消賽事", danger: true, hint: "取消後賽事將終止，無法復原。" })}
                >
                  取消賽事
                </Button>
              )}
            </div>
          </CardBody>
        </Card>
      )}

      {actionError && (
        <div className="mt-4">
          <ErrorBanner>{actionError}</ErrorBanner>
        </div>
      )}

      {/* Tabs */}
      <nav className="mt-6 flex flex-wrap gap-1 border-b border-border" aria-label="賽事分頁">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => { setTab(t.id); setActionError(null); }}
            className={cn(
              "min-h-[44px] border-b-2 px-4 text-sm font-medium transition-colors",
              tab === t.id ? "border-brand text-foreground" : "border-transparent text-muted-fg hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "overview" && (
        <OverviewTab
          tournament={tournament}
          manageable={manageable}
          isDraft={isDraft}
          editForm={editForm}
          setEditForm={setEditForm}
          onSave={handleSaveEdit}
          saving={savingEdit}
          tournamentId={id}
          userId={userId!}
          categories={categories}
          reloadCategories={loadCategories}
        />
      )}

      {tab === "registrations" && (
        <RegistrationsTab
          registrations={registrations}
          manageable={manageable}
          tournamentName={tournament.name}
          userId={userId!}
          categories={categories}
          reload={async () => { await Promise.all([loadRegistrations(), loadCategories()]); }}
        />
      )}

      {tab === "checkin" && (
        <CheckinTab
          registrations={registrations}
          checkins={checkins}
          operable={checkinOperable}
          checkinOpen={tournament.status === "checkin_open"}
          userId={userId!}
          categories={categories}
          reload={async () => { await Promise.all([loadRegistrations(), loadCheckins(), loadCategories()]); }}
        />
      )}

      {tab === "pairing" && (
        <PairingTab
          matches={matches}
          canPair={canPair}
          manageable={manageable}
          tournamentId={id}
          gameKey={tournament.gameKey}
          userId={userId!}
          reload={loadMatches}
          setActionError={setActionError}
        />
      )}

      {tab === "standings" && (
        <StandingsTab
          standings={standings}
          categories={categories}
          reload={loadStandings}
          tournamentId={id}
          status={tournament.status}
          manageable={manageable}
          userId={userId!}
        />
      )}

      {tab === "roles" && manageable && (
        <RolesTab roles={roles} tournamentId={id} userId={userId!} reload={loadRoles} />
      )}

      <Link href="/admin/tournaments" className="mt-8 inline-block text-sm text-brand-subtle-fg hover:underline">
        ← 返回賽事列表
      </Link>

      <ConfirmDialog
        open={!!pendingEvent}
        title={pendingEvent?.label ?? ""}
        description={pendingEvent?.hint}
        confirmLabel={pendingEvent?.label ?? "確定"}
        danger={pendingEvent?.danger}
        loading={eventBusy}
        onConfirm={runEvent}
        onCancel={() => { if (!eventBusy) setPendingEvent(null); }}
      />
    </div>
  );
}

function Stepper({ status }: { status: string }) {
  if (status === "cancelled") {
    return (
      <div className="rounded-token-lg border border-[var(--tone-danger-border)] bg-[var(--tone-danger-bg)] px-4 py-3 text-sm font-medium text-[var(--tone-danger-fg)]">
        此賽事已取消。
      </div>
    );
  }
  const currentIdx = FLOW.findIndex((f) => f.status === status);
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-3">
      {FLOW.map((f, i) => {
        const done = i < currentIdx;
        const current = i === currentIdx;
        return (
          <li key={f.status} className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold",
                done && "bg-brand text-brand-fg",
                current && "bg-brand text-brand-fg ring-2 ring-brand ring-offset-2 ring-offset-background",
                !done && !current && "bg-surface-muted text-muted-fg"
              )}
            >
              {done ? "✓" : i + 1}
            </span>
            <span className={cn("text-sm", current ? "font-semibold text-foreground" : "text-muted-fg")}>
              {TOURNAMENT_STATUS[f.status].label}
            </span>
            {i < FLOW.length - 1 && <span className="mx-1 text-muted-fg">→</span>}
          </li>
        );
      })}
    </ol>
  );
}

function OverviewTab({
  tournament,
  manageable,
  isDraft,
  editForm,
  setEditForm,
  onSave,
  saving,
  tournamentId,
  userId,
  categories,
  reloadCategories,
}: {
  tournament: Tournament;
  manageable: boolean;
  isDraft: boolean;
  editForm: Partial<Tournament>;
  setEditForm: React.Dispatch<React.SetStateAction<Partial<Tournament>>>;
  onSave: () => void;
  saving: boolean;
  tournamentId: string;
  userId: string;
  categories: TournamentCategory[];
  reloadCategories: () => void;
}) {
  const inputCls = "mt-1 min-h-[44px] w-full rounded-token-md border border-border bg-surface px-3 text-foreground focus:outline-none focus:ring-2 focus:ring-brand";
  return (
    <div className="mt-6 space-y-6">
      <Card>
        <CardBody>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Field label="棋種" value={gameLabel(tournament.gameKey)} />
            <Field label="規則版本" value={tournament.rulesetVersion} />
            <Field label="賽制" value={tournament.format} />
            <Field label="輪次" value={String(tournament.roundCount)} />
            <Field label="開始時間" value={fmtDateTime(tournament.startsAt)} />
            <Field label="結束時間" value={fmtDateTime(tournament.endsAt)} />
            {tournament.timezone && <Field label="時區" value={tournament.timezone} />}
          </dl>
        </CardBody>
      </Card>

      {manageable && isDraft && (
        <Card>
          <CardBody>
            <h2 className="text-base font-semibold text-foreground">編輯賽事（草稿）</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="font-medium text-foreground">賽事名稱</span>
                <input className={inputCls} value={editForm.name ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-foreground">棋種</span>
                <select className={inputCls} value={editForm.gameKey ?? "go"} onChange={(e) => setEditForm((f) => ({ ...f, gameKey: e.target.value }))}>
                  {GAME_KEYS.map((k) => <option key={k} value={k}>{GAME_LABEL[k]}</option>)}
                </select>
              </label>
              <label className="block text-sm">
                <span className="font-medium text-foreground">賽制</span>
                <input className={inputCls} value={editForm.format ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, format: e.target.value }))} />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-foreground">輪次數</span>
                <input type="number" min={1} className={inputCls} value={editForm.roundCount ?? 1} onChange={(e) => setEditForm((f) => ({ ...f, roundCount: parseInt(e.target.value, 10) || 1 }))} />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-foreground">開始時間</span>
                <input type="datetime-local" className={inputCls} value={toLocalDatetimeLocal(editForm.startsAt)} onChange={(e) => setEditForm((f) => ({ ...f, startsAt: e.target.value ? new Date(e.target.value).toISOString() : undefined }))} />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-foreground">結束時間</span>
                <input type="datetime-local" className={inputCls} value={toLocalDatetimeLocal(editForm.endsAt)} onChange={(e) => setEditForm((f) => ({ ...f, endsAt: e.target.value ? new Date(e.target.value).toISOString() : undefined }))} />
              </label>
            </div>
            <div className="mt-4">
              <Button onClick={onSave} loading={saving}>儲存</Button>
            </div>
          </CardBody>
        </Card>
      )}

      <CategoriesSection
        tournamentId={tournamentId}
        userId={userId}
        manageable={manageable}
        categories={categories}
        tournamentClosed={tournament.status === "closed" || tournament.status === "cancelled"}
        reload={reloadCategories}
      />
    </div>
  );
}

function CategoriesSection({
  tournamentId,
  userId,
  manageable,
  categories,
  tournamentClosed,
  reload,
}: {
  tournamentId: string;
  userId: string;
  manageable: boolean;
  categories: TournamentCategory[];
  tournamentClosed: boolean;
  reload: () => void;
}) {
  const [key, setKey] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [capacity, setCapacity] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const add = async () => {
    if (!key.trim() || !displayName.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/otc/tournaments/${tournamentId}/categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-id": userId },
        body: JSON.stringify({
          key: key.trim().toLowerCase(),
          displayName: displayName.trim(),
          capacity: capacity ? parseInt(capacity, 10) : null,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setKey("");
        setDisplayName("");
        setCapacity("");
        reload();
      } else {
        setErr(data?.message ?? data?.code ?? "新增失敗");
      }
    } finally {
      setBusy(false);
    }
  };

  const remove = async (categoryId: string) => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/otc/tournaments/${tournamentId}/categories/${categoryId}`, {
        method: "DELETE",
        headers: { "x-user-id": userId },
      });
      if (res.ok || res.status === 204) reload();
      else {
        const data = await res.json().catch(() => null);
        setErr(data?.message ?? data?.code ?? "刪除失敗");
      }
    } finally {
      setBusy(false);
    }
  };

  const inputCls = "mt-1 min-h-[44px] w-full rounded-token-md border border-border bg-surface px-3 text-foreground focus:outline-none focus:ring-2 focus:ring-brand";

  return (
    <Card>
      <CardBody>
        <h2 className="text-base font-semibold text-foreground">賽事組別</h2>
        <p className="mt-1 text-sm text-muted-fg">
          {categories.length === 0
            ? "未設定組別時為單一預設組（相容舊賽事）。"
            : `已設定 ${categories.length} 個組別；報名時須選組。`}
        </p>
        {err && <div className="mt-2"><ErrorBanner>{err}</ErrorBanner></div>}
        {categories.length > 0 && (
          <ul className="mt-4 space-y-2">
            {categories.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-token-lg border border-border bg-surface-muted px-3 py-2">
                <div>
                  <span className="font-medium text-foreground">{c.displayName}</span>
                  <span className="ml-2 text-xs text-muted-fg">key: {c.key}</span>
                  {c.capacity != null && <span className="ml-2 text-xs text-muted-fg">上限 {c.capacity} 人</span>}
                </div>
                {manageable && !tournamentClosed && (
                  <Button size="sm" variant="danger" onClick={() => remove(c.id)} disabled={busy}>刪除</Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {manageable && !tournamentClosed && (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="block text-sm">
              <span className="font-medium text-foreground">Key（英文）</span>
              <input className={inputCls} placeholder="dan" value={key} onChange={(e) => setKey(e.target.value)} />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-foreground">顯示名稱</span>
              <input className={inputCls} placeholder="段位組" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-foreground">人數上限（選填）</span>
              <input type="number" min={1} className={inputCls} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
            </label>
          </div>
        )}
        {manageable && !tournamentClosed && (
          <div className="mt-3">
            <Button onClick={add} loading={busy} disabled={!key.trim() || !displayName.trim()}>新增組別</Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase text-muted-fg">{label}</dt>
      <dd className="mt-1 text-foreground">{value}</dd>
    </div>
  );
}

function RegistrationsTab({
  registrations,
  manageable,
  tournamentName,
  userId,
  categories,
  reload,
}: {
  registrations: Registration[];
  manageable: boolean;
  tournamentName: string;
  userId: string;
  categories: TournamentCategory[];
  reload: () => void;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(
    () => registrations.filter((r) => r.userId.toLowerCase().includes(q.trim().toLowerCase())),
    [registrations, q]
  );

  const exportCsv = () => {
    const rows = [["userId", "status", "categoryKey"], ...registrations.map((r) => [r.userId, r.status, r.categoryKey ?? ""])];
    const csv = rows.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${tournamentName}-報名名單.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const groups = useMemo(() => {
    const labelOf = (k: string) => categories.find((c) => c.key === k)?.displayName ?? k;
    const map = new Map<string, Registration[]>();
    for (const r of filtered) {
      const key = r.categoryKey?.trim() || "未分組";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return [...map.entries()]
      .sort((a, b) => (a[0] === "未分組" ? -1 : b[0] === "未分組" ? 1 : a[0].localeCompare(b[0])))
      .map(([groupKey, list]) => ({ groupKey: labelOf(groupKey === "未分組" ? "" : groupKey) || "未分組", list }));
  }, [filtered, categories]);

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜尋選手 ID…"
          className="min-h-[44px] rounded-token-md border border-border bg-surface px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand"
        />
        <span className="text-sm text-muted-fg">共 {filtered.length} 人</span>
        <div className="ml-auto">
          <Button variant="secondary" size="sm" onClick={exportCsv} disabled={registrations.length === 0}>
            匯出 CSV
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="尚無符合的報名。" />
      ) : (
        groups.map(({ groupKey, list }) => (
          <div key={groupKey}>
            <h3 className="mb-2 text-sm font-semibold text-foreground">分組：{groupKey} <span className="font-normal text-muted-fg">（{list.length} 人）</span></h3>
            <ul className="space-y-2">
              {list.map((r) => (
                <RegistrationRow key={r.id} registration={r} manageable={manageable} userId={userId} reload={reload} />
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}

function RegistrationRow({
  registration,
  manageable,
  userId,
  reload,
}: {
  registration: Registration;
  manageable: boolean;
  userId: string;
  reload: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState("0");
  const markPaid = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/otc/registrations/${registration.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-id": userId },
        body: JSON.stringify({ amountCents: parseInt(amount, 10) || 0, currency: "TWD" }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.id) {
        await fetch(`/api/otc/payments/${data.id}/events/mark-succeeded`, { method: "POST", headers: { "x-user-id": userId } });
        reload();
      }
    } finally {
      setBusy(false);
    }
  };
  const payable = registration.status !== "paid" && registration.status !== "cancelled";
  return (
    <li className="flex flex-col gap-2 rounded-token-lg border border-border bg-surface p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        <span className="font-medium text-foreground">{registration.userId}</span>
        <StatusBadge domain="registration" value={registration.status} />
      </div>
      {manageable && payable && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-label="付款金額（分）"
            className="min-h-[44px] w-24 rounded-token-md border border-border bg-surface px-2 text-foreground"
          />
          <Button size="sm" onClick={markPaid} loading={busy}>標記已繳費</Button>
        </div>
      )}
    </li>
  );
}

function CheckinTab({
  registrations,
  checkins,
  operable,
  checkinOpen,
  userId,
  categories,
  reload,
}: {
  registrations: Registration[];
  checkins: Record<string, string>;
  operable: boolean;
  checkinOpen: boolean;
  userId: string;
  categories: TournamentCategory[];
  reload: () => Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [batchBusy, setBatchBusy] = useState(false);
  const active = registrations.filter((r) => r.status !== "cancelled");
  const filtered = active.filter((r) => r.userId.toLowerCase().includes(q.trim().toLowerCase()));
  const notCheckedIn = active.filter((r) => checkins[r.id] !== "checked_in");

  const act = async (regId: string, event: "check-in" | "withdraw") => {
    await fetch(`/api/otc/registrations/${regId}/checkin/events/${event}`, { method: "POST", headers: { "x-user-id": userId } });
    await reload();
  };

  const batchCheckIn = async () => {
    setBatchBusy(true);
    try {
      for (const r of notCheckedIn) {
        await fetch(`/api/otc/registrations/${r.id}/checkin/events/check-in`, { method: "POST", headers: { "x-user-id": userId } });
      }
      await reload();
    } finally {
      setBatchBusy(false);
    }
  };

  if (!checkinOpen) {
    return (
      <div className="mt-6">
        <EmptyState title="目前非報到階段。" description="將賽事推進至「開放報到」後即可在此為選手報到。" />
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜尋選手 ID…"
          className="min-h-[44px] rounded-token-md border border-border bg-surface px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand"
        />
        <span className="text-sm text-muted-fg">已報到 {active.length - notCheckedIn.length}/{active.length}</span>
        {operable && notCheckedIn.length > 0 && (
          <div className="ml-auto">
            <Button size="sm" onClick={batchCheckIn} loading={batchBusy}>全部報到（{notCheckedIn.length}）</Button>
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="尚無符合的報名。" />
      ) : (
        <ul className="space-y-2">
          {filtered.map((r) => {
            const cs = checkins[r.id] ?? "not_checked_in";
            const catLabel = categories.find((c) => c.key === r.categoryKey)?.displayName ?? r.categoryKey ?? "未分組";
            return (
              <li key={r.id} className="flex flex-col gap-2 rounded-token-lg border border-border bg-surface p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">{r.userId}</span>
                  <Badge tone="muted">{catLabel}</Badge>
                  <StatusBadge domain="checkin" value={cs} />
                </div>
                {operable && (
                  <div className="flex flex-wrap items-center gap-2">
                    {categories.length > 0 && (
                      <select
                        aria-label="變更組別"
                        className="min-h-[44px] rounded-token-md border border-border bg-surface px-2 text-sm text-foreground"
                        value={r.categoryKey ?? ""}
                        onChange={async (e) => {
                          const categoryKey = e.target.value;
                          if (!categoryKey) return;
                          await fetch(`/api/otc/registrations/${r.id}/events/change-category`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json", "x-user-id": userId },
                            body: JSON.stringify({ categoryKey }),
                          });
                          await reload();
                        }}
                      >
                        {categories.map((c) => (
                          <option key={c.id} value={c.key}>{c.displayName}</option>
                        ))}
                      </select>
                    )}
                    {cs !== "checked_in" && (
                      <Button size="sm" onClick={() => act(r.id, "check-in")}>報到</Button>
                    )}
                    {cs !== "withdrawn" && (
                      <Button size="sm" variant="danger" onClick={() => act(r.id, "withdraw")}>退賽</Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function PairingTab({
  matches,
  canPair,
  manageable,
  tournamentId,
  gameKey,
  userId,
  reload,
  setActionError,
}: {
  matches: Match[];
  canPair: boolean;
  manageable: boolean;
  tournamentId: string;
  gameKey: string;
  userId: string;
  reload: () => void;
  setActionError: (s: string | null) => void;
}) {
  const [roundNo, setRoundNo] = useState("1");
  const [busy, setBusy] = useState(false);
  const generate = async () => {
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/otc/tournaments/${tournamentId}/pairings/events/generate-round`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-id": userId },
        body: JSON.stringify({ roundNo: parseInt(roundNo, 10) || 1 }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) reload();
      else setActionError(data?.message ?? data?.code ?? "產生編排失敗");
    } finally {
      setBusy(false);
    }
  };

  const byRound = useMemo(() => {
    const map = new Map<number, Match[]>();
    for (const m of matches) {
      if (!map.has(m.roundNo)) map.set(m.roundNo, []);
      map.get(m.roundNo)!.push(m);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [matches]);

  return (
    <div className="mt-6 space-y-5">
      {manageable && canPair && (
        <Card>
          <CardBody className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="font-medium text-foreground">輪次</span>
              <input
                type="number"
                min={1}
                value={roundNo}
                onChange={(e) => setRoundNo(e.target.value)}
                className="mt-1 block min-h-[44px] w-24 rounded-token-md border border-border bg-surface px-3 text-foreground"
              />
            </label>
            <Button onClick={generate} loading={busy}>產生此輪編排</Button>
          </CardBody>
        </Card>
      )}

      {matches.length === 0 ? (
        <EmptyState title="尚無對局。" description={canPair ? "使用上方「產生此輪編排」建立對局。" : "賽事進入編排階段後可產生對局。"} />
      ) : (
        byRound.map(([r, list]) => (
          <div key={r}>
            <h3 className="mb-2 text-sm font-semibold text-foreground">第 {r} 輪 <span className="font-normal text-muted-fg">（{list.length} 場）</span></h3>
            <ul className="space-y-2">
              {list.map((m) => (
                <MatchRow key={m.id} match={m} manageable={manageable} gameKey={gameKey} userId={userId} reload={reload} />
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}

function MatchRow({
  match,
  manageable,
  gameKey,
  userId,
  reload,
}: {
  match: Match;
  manageable: boolean;
  gameKey: string;
  userId: string;
  reload: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<"win" | "draw" | "void">("win");
  const [winner, setWinner] = useState<"A" | "B">("A");
  const submit = async () => {
    setBusy(true);
    try {
      const result = kind === "win" ? { kind: "win", winner } : kind === "draw" ? { kind: "draw" } : { kind: "void" };
      const res = await fetch(`/api/otc/matches/${match.id}/result`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-id": userId },
        body: JSON.stringify({ result }),
      });
      if (res.ok) reload();
      else {
        const data = await res.json().catch(() => null);
        alert(data?.message ?? data?.code ?? "上傳失敗");
      }
    } finally {
      setBusy(false);
    }
  };
  const finished = match.status === "finished";
  const resultText = finished && match.result
    ? match.result.kind === "win"
      ? `${match.result.winner} 勝`
      : match.result.kind === "draw"
        ? "和局"
        : "作廢"
    : null;
  return (
    <li className="flex flex-col gap-2 rounded-token-lg border border-border bg-surface p-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-xs text-muted-fg">
          第 {match.roundNo} 輪{match.tableNo != null && ` · 桌 ${match.tableNo}`}
          {match.categoryKey && ` · ${match.categoryKey}`}
        </p>
        <p className="mt-1 font-medium text-foreground">{match.playerAId} vs {match.playerBId}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {finished ? (
          <StatusBadge domain="match" value={match.status} />
        ) : (
          <Badge tone="neutral">{statusMeta("match", match.status).label}</Badge>
        )}
        {resultText && <Badge tone={match.result?.kind === "void" ? "muted" : "info"}>{resultText}</Badge>}
        {manageable && !finished && (
          <>
            <select value={kind} onChange={(e) => setKind(e.target.value as "win" | "draw" | "void")} aria-label="結果類型" className="min-h-[44px] rounded-token-md border border-border bg-surface px-2 text-foreground">
              <option value="win">勝負</option>
              <option value="draw">和局</option>
              <option value="void">作廢</option>
            </select>
            {kind === "win" && (
              <select value={winner} onChange={(e) => setWinner(e.target.value as "A" | "B")} aria-label="勝方" className="min-h-[44px] rounded-token-md border border-border bg-surface px-2 text-foreground">
                <option value="A">A 勝</option>
                <option value="B">B 勝</option>
              </select>
            )}
            <Button size="sm" onClick={submit} loading={busy}>上傳</Button>
          </>
        )}
      </div>
    </li>
  );
}

function StandingsTab({
  standings,
  categories,
  reload,
  tournamentId,
  status,
  manageable,
  userId,
}: {
  standings: StandingsRow[];
  categories: TournamentCategory[];
  reload: () => void;
  tournamentId: string;
  status: string;
  manageable: boolean;
  userId: string;
}) {
  const [ratingBusy, setRatingBusy] = useState(false);
  const [ratingMsg, setRatingMsg] = useState<string | null>(null);
  const [confirmRating, setConfirmRating] = useState(false);
  // 賽事已結束時最適合計算等級分（結果已定案）
  const canRate = manageable && (status === "in_progress" || status === "closed");

  const calcRatings = async () => {
    setRatingBusy(true);
    setRatingMsg(null);
    try {
      const res = await fetch(`/api/otc/tournaments/${tournamentId}/calculate-ratings`, {
        method: "POST",
        headers: { "x-user-id": userId },
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setRatingMsg(`已計算：${data?.matchesProcessed ?? 0} 場、${data?.playersAffected ?? 0} 位棋手更新等級分。`);
        setConfirmRating(false);
      } else if (data?.code === "ALREADY_RATED") {
        setRatingMsg("此賽事已計算過等級分（不重複計算）。");
        setConfirmRating(false);
      } else {
        setRatingMsg(data?.message ?? data?.code ?? "計算失敗");
      }
    } catch (e) {
      setRatingMsg(e instanceof Error ? e.message : "網路錯誤");
    } finally {
      setRatingBusy(false);
    }
  };

  const grouped = useMemo(() => {
    const labelOf = (k: string | null | undefined) =>
      categories.find((c) => c.key === k)?.displayName ?? (k?.trim() || "未分組");
    const map = new Map<string, StandingsRow[]>();
    for (const row of standings) {
      const g = labelOf(row.categoryKey);
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(row);
    }
    return [...map.entries()];
  }, [standings, categories]);

  return (
    <div className="mt-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-muted-fg">即時排名預覽</span>
        <div className="flex items-center gap-2">
          {canRate && (
            <Button variant="secondary" size="sm" onClick={() => setConfirmRating(true)} loading={ratingBusy}>
              計算等級分
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={reload}>重新整理</Button>
        </div>
      </div>
      {ratingMsg && (
        <div className="mb-3 rounded-token-md border border-border bg-surface-muted px-3 py-2 text-sm text-foreground">
          {ratingMsg}
        </div>
      )}
      <ConfirmDialog
        open={confirmRating}
        title="計算等級分"
        description={<span>將依本賽事已完成對局，更新各棋手的 ELO 等級分。<span className="mt-2 block text-xs">MVP：每場賽事僅能計算一次，計算後不可重算。</span></span>}
        confirmLabel="開始計算"
        loading={ratingBusy}
        onConfirm={calcRatings}
        onCancel={() => { if (!ratingBusy) setConfirmRating(false); }}
      />
      {standings.length === 0 ? (
        <EmptyState title="尚無排名資料。" description="需有已結束的對局後才會產生名次。" />
      ) : (
        <div className="space-y-6">
          {grouped.map(([groupLabel, rows]) => (
            <Card key={groupLabel}>
              <div className="border-b border-border px-4 py-2 text-sm font-semibold text-foreground">
                分組：{groupLabel}
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-fg">
                      <th className="px-4 py-2">名次</th>
                      <th className="px-4 py-2">選手</th>
                      <th className="px-4 py-2 text-right">場</th>
                      <th className="px-4 py-2 text-right">勝/和/負</th>
                      <th className="px-4 py-2 text-right">積分</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={row.playerId} className="border-b border-border last:border-0">
                        <td className="px-4 py-2 text-muted-fg">{i + 1}</td>
                        <td className="px-4 py-2 font-medium text-foreground">{row.playerId}</td>
                        <td className="px-4 py-2 text-right text-muted-fg">{row.played}</td>
                        <td className="px-4 py-2 text-right text-muted-fg">{row.wins}/{row.draws}/{row.losses}</td>
                        <td className="px-4 py-2 text-right font-semibold text-foreground">{row.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function RolesTab({
  roles,
  tournamentId,
  userId,
  reload,
}: {
  roles: TournamentRole[];
  tournamentId: string;
  userId: string;
  reload: () => void;
}) {
  const [newUserId, setNewUserId] = useState("");
  const [role, setRole] = useState<"referee" | "staff" | "organizer">("referee");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const add = async () => {
    if (!newUserId.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/otc/tournaments/${tournamentId}/roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-id": userId },
        body: JSON.stringify({ userId: newUserId.trim(), role }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) { setNewUserId(""); reload(); }
      else setErr(data?.message ?? data?.code ?? "新增失敗");
    } finally {
      setBusy(false);
    }
  };
  const remove = async (roleId: string) => {
    const res = await fetch(`/api/otc/tournaments/${tournamentId}/roles/${roleId}`, { method: "DELETE", headers: { "x-user-id": userId } });
    if (res.ok) reload();
  };

  return (
    <div className="mt-6 space-y-5">
      <Card>
        <CardBody>
          <h2 className="text-base font-semibold text-foreground">指派賽事角色</h2>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="font-medium text-foreground">使用者 ID</span>
              <input value={newUserId} onChange={(e) => setNewUserId(e.target.value)} className="mt-1 block min-h-[44px] w-48 rounded-token-md border border-border bg-surface px-3 text-foreground" />
            </label>
            <label className="text-sm">
              <span className="font-medium text-foreground">角色</span>
              <select value={role} onChange={(e) => setRole(e.target.value as "referee" | "staff" | "organizer")} className="mt-1 block min-h-[44px] rounded-token-md border border-border bg-surface px-3 text-foreground">
                <option value="referee">裁判</option>
                <option value="staff">工作人員</option>
                <option value="organizer">賽事負責人</option>
              </select>
            </label>
            <Button onClick={add} loading={busy} disabled={!newUserId.trim()}>新增</Button>
          </div>
          {err && <p className="mt-2 text-sm text-[var(--tone-danger-fg)]">{err}</p>}
        </CardBody>
      </Card>

      {roles.length === 0 ? (
        <EmptyState title="尚無指派。" />
      ) : (
        <ul className="space-y-2">
          {roles.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 rounded-token-lg border border-border bg-surface p-3">
              <span className="font-medium text-foreground">{r.userId}</span>
              <div className="flex items-center gap-2">
                <Badge tone="neutral">{TOURNAMENT_ROLE_LABEL[r.role] ?? r.role}</Badge>
                <Button size="sm" variant="danger" onClick={() => remove(r.id)}>移除</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
