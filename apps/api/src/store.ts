import { randomUUID } from 'node:crypto';

import type { GameKey, NormalizedMatchResult } from '@otc/rules';

export type Id = string;

export type Organization = {
  id: Id;
  name: string;
  slug: string;
  createdAt: string;
};

export type OrganizationMembership = {
  id: Id;
  organizationId: Id;
  userId: Id;
  role: 'owner' | 'admin' | 'staff';
  createdAt: string;
};

export type TournamentStatus =
  | 'draft'
  | 'published'
  | 'checkin_open'
  | 'pairing_ready'
  | 'in_progress'
  | 'closed'
  | 'cancelled';

export type Tournament = {
  id: Id;
  organizationId: Id;
  name: string;
  gameKey: GameKey;
  rulesetVersion: string;
  timezone: string;
  format: string;
  roundCount: number;
  startsAt?: string;
  endsAt?: string;
  status: TournamentStatus;
  createdAt: string;
  updatedAt: string;
};

export type TournamentRole = {
  id: Id;
  tournamentId: Id;
  userId: Id;
  role: 'organizer' | 'staff' | 'referee';
  createdAt: string;
};

export type RegistrationStatus = 'created' | 'awaiting_payment' | 'paid' | 'cancelled' | 'refunded';

export type Registration = {
  id: Id;
  tournamentId: Id;
  userId: Id;
  status: RegistrationStatus;
  categoryKey?: string;
  createdAt: string;
  updatedAt: string;
};

export type PaymentStatus = 'initiated' | 'pending' | 'succeeded' | 'failed' | 'cancelled' | 'refunded';

export type Payment = {
  id: Id;
  registrationId: Id;
  status: PaymentStatus;
  providerKey: string; // MVP: mock
  providerRef?: string;
  amountCents: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
};

export type CheckInStatus = 'not_checked_in' | 'checked_in' | 'withdrawn' | 'replaced';

export type CheckIn = {
  id: Id;
  registrationId: Id;
  status: CheckInStatus;
  checkedInAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type MatchStatus = 'scheduled' | 'playing' | 'finished' | 'void';

export type Match = {
  id: Id;
  tournamentId: Id;
  roundNo: number;
  tableNo?: number;
  /** 對局所屬組別（分組賽事）；未分組賽事為 undefined（單一組） */
  categoryKey?: string;
  playerAId: Id;
  playerBId: Id;
  /** 先手方（A/B）；輪空/未指定為 undefined */
  firstMove?: 'A' | 'B';
  status: MatchStatus;
  result?: NormalizedMatchResult;
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
};

export type UserStatus = 'active' | 'suspended';

export type User = {
  id: Id;
  displayName: string;
  email?: string;
  platformRole?: 'platform_admin' | null;
  /** 帳號狀態；未設定視為 active。suspended 者無法呼叫需登入的 API。 */
  status?: UserStatus;
  avatarUrl?: string | null;
  /** Internal: for ensureFromGoogle lookup when using InMemory store */
  googleSub?: string;
  createdAt: string;
};

export class InMemoryStore {
  users = new Map<Id, User>();
  organizations = new Map<Id, Organization>();
  orgMemberships = new Map<Id, OrganizationMembership>();
  tournaments = new Map<Id, Tournament>();
  tournamentRoles = new Map<Id, TournamentRole>();
  registrations = new Map<Id, Registration>();
  payments = new Map<Id, Payment>();
  checkins = new Map<Id, CheckIn>();
  matches = new Map<Id, Match>();

  nowIso() {
    return new Date().toISOString();
  }

  newId() {
    return randomUUID();
  }

  /** MVP：若無登入系統，先用 x-user-id 模擬；若不存在則自動建立 */
  ensureUser(userId: string): User {
    const existing = this.users.get(userId);
    if (existing) return existing;
    const u: User = { id: userId, displayName: `User-${userId.slice(0, 6)}`, createdAt: this.nowIso() };
    this.users.set(u.id, u);
    return u;
  }

  /** Find user by google_sub (InMemory: iterate). */
  getUserByGoogleSub(sub: string): User | undefined {
    for (const u of this.users.values()) {
      if (u.googleSub === sub) return u;
    }
    return undefined;
  }
}

export const store = new InMemoryStore();




