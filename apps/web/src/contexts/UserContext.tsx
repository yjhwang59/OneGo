"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSession } from "next-auth/react";

const STORAGE_KEY = "otc-mvp-user-id";

type UserContextValue = {
  userId: string | null;
  setUserId: (id: string | null) => void;
  isAuthenticated: boolean;
  /** 平台總管時為 'platform_admin'，否則 null（由 GET /api/me 取得） */
  platformRole: string | null;
  /** 使用者在各主辦單位的成員角色（owner/admin/staff）去重清單 */
  orgRoles: string[];
  /** 是否在任一賽事被指派為裁判 */
  isReferee: boolean;
  /** 來自 Google 登入時為 true；僅 模擬登入 時為 false */
  fromSession: boolean;
  displayName: string | null;
};

const UserContext = createContext<UserContextValue | null>(null);

function getStored(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
}

export function UserProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const [storedId, setStoredId] = useState<string | null>(null);
  const [platformRole, setPlatformRole] = useState<string | null>(null);
  const [orgRoles, setOrgRoles] = useState<string[]>([]);
  const [isReferee, setIsReferee] = useState(false);

  useEffect(() => {
    setStoredId(getStored());
  }, []);

  const fromSession = status === "authenticated" && !!session?.user?.id;
  const userId = fromSession ? (session!.user as { id: string }).id : storedId;

  useEffect(() => {
    if (!userId) {
      setPlatformRole(null);
      setOrgRoles([]);
      setIsReferee(false);
      return;
    }
    let cancelled = false;
    fetch("/api/otc/me", userId ? { headers: { "x-user-id": userId } } : {})
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (
          data:
            | { platformRole?: string | null; orgRoles?: string[]; isReferee?: boolean }
            | null
        ) => {
          if (cancelled || !data) return;
          setPlatformRole(data.platformRole ?? null);
          setOrgRoles(Array.isArray(data.orgRoles) ? data.orgRoles : []);
          setIsReferee(!!data.isReferee);
        }
      )
      .catch(() => {
        if (cancelled) return;
        setPlatformRole(null);
        setOrgRoles([]);
        setIsReferee(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const setUserId = useCallback((id: string | null) => {
    if (id === null) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, id);
    }
    setStoredId(id);
  }, []);

  const displayName = fromSession ? (session?.user?.name ?? null) : null;

  const value = useMemo(
    () => ({
      userId,
      setUserId,
      isAuthenticated: !!userId,
      platformRole: platformRole ?? null,
      orgRoles,
      isReferee,
      fromSession: !!fromSession,
      displayName,
    }),
    [userId, setUserId, platformRole, orgRoles, isReferee, fromSession, displayName]
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used within UserProvider");
  return ctx;
}
