"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/contexts/UserContext";
import {
  PageHeader,
  Card,
  CardBody,
  Button,
  Spinner,
  ErrorBanner,
  Badge,
} from "@/components/ui";

type MeProfile = {
  userId: string;
  displayName?: string;
  email?: string | null;
  avatarUrl?: string | null;
  googleLinked?: boolean;
  createdAt?: string;
};

export default function MeSettingsPage() {
  const { userId, isAuthenticated, refreshProfile } = useUser();
  const [profile, setProfile] = useState<MeProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch("/api/otc/me", { headers: { "x-user-id": userId } });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.message ?? data?.code ?? "無法載入帳號資料");
        return;
      }
      setProfile(data);
      setDisplayName(data.displayName ?? "");
      setEmail(data.email ?? "");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "網路錯誤");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (isAuthenticated && userId) load();
    else setLoading(false);
  }, [isAuthenticated, userId, load]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/otc/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-user-id": userId },
        body: JSON.stringify({
          displayName: displayName.trim() || undefined,
          email: email.trim() || null,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setSaveError(data?.message ?? data?.code ?? "儲存失敗");
        return;
      }
      setProfile(data);
      setSaved(true);
      refreshProfile();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "網路錯誤");
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "min-h-[44px] w-full rounded-token-md border border-border bg-surface px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand sm:max-w-md";

  if (!isAuthenticated) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <ErrorBanner tone="warning">請先登入以編輯帳號設定。</ErrorBanner>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <PageHeader title="帳號設定" description="更新您的顯示名稱與 Email。" />

      {loading && (
        <div className="mt-6 flex items-center gap-3 text-muted-fg">
          <Spinner /> 載入中…
        </div>
      )}

      {!loading && error && (
        <div className="mt-6">
          <ErrorBanner>{error}</ErrorBanner>
        </div>
      )}

      {!loading && !error && profile && (
        <Card className="mt-6 max-w-xl">
          <CardBody>
            <dl className="mb-6 space-y-2 text-sm">
              <div>
                <dt className="text-muted-fg">使用者 ID</dt>
                <dd className="font-mono text-foreground">{profile.userId}</dd>
              </div>
              {profile.googleLinked && (
                <div>
                  <dt className="text-muted-fg">登入方式</dt>
                  <dd>
                    <Badge tone="info">已綁定 Google</Badge>
                  </dd>
                </div>
              )}
              {profile.createdAt && (
                <div>
                  <dt className="text-muted-fg">建立時間</dt>
                  <dd>{new Date(profile.createdAt).toLocaleString()}</dd>
                </div>
              )}
            </dl>

            <form onSubmit={handleSave} className="space-y-4">
              {saveError && <ErrorBanner>{saveError}</ErrorBanner>}
              {saved && (
                <p className="text-sm text-[var(--tone-success-fg)]">已儲存變更。</p>
              )}
              <label className="block text-sm">
                <span className="font-medium text-foreground">顯示名稱</span>
                <input
                  className={`mt-1 ${inputCls}`}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-foreground">Email</span>
                <input
                  className={`mt-1 ${inputCls}`}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="選填"
                />
              </label>
              <Button type="submit" loading={saving}>
                儲存
              </Button>
            </form>
          </CardBody>
        </Card>
      )}
    </main>
  );
}
