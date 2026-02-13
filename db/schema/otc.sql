-- OTC 資料表草案（PostgreSQL）
-- 原則：Tournament / Match 為核心；Registration/Payment/CheckIn 等周邊表只引用核心，不侵入其責任。

create extension if not exists "pgcrypto";

-- ===== ENUMs =====
do $$
begin
  if not exists (select 1 from pg_type where typname = 'game_key') then
    create type game_key as enum ('go', 'chess', 'xiangqi', 'gomoku');
  end if;

  if not exists (select 1 from pg_type where typname = 'tournament_status') then
    create type tournament_status as enum (
      'draft',
      'published',
      'checkin_open',
      'pairing_ready',
      'in_progress',
      'closed',
      'cancelled'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'match_status') then
    create type match_status as enum ('scheduled', 'playing', 'finished', 'void');
  end if;

  if not exists (select 1 from pg_type where typname = 'registration_status') then
    create type registration_status as enum ('created', 'awaiting_payment', 'paid', 'cancelled', 'refunded');
  end if;

  if not exists (select 1 from pg_type where typname = 'payment_status') then
    create type payment_status as enum ('initiated', 'pending', 'succeeded', 'failed', 'cancelled', 'refunded');
  end if;

  if not exists (select 1 from pg_type where typname = 'checkin_status') then
    create type checkin_status as enum ('not_checked_in', 'checked_in', 'withdrawn', 'replaced');
  end if;
end $$;

-- ===== Identity（MVP 極簡：先不做完整 auth） =====
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ===== Multi-Organization（多主辦單位，多租戶邊界）=====
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 組織成員（組織層級角色）
create table if not exists organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references users(id) on delete restrict,
  role text not null, -- owner/admin/staff（先用 text，後續可 enum）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_org_member unique (organization_id, user_id)
);

-- ===== Core: Tournament / Match =====
create table if not exists tournaments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  name text not null,
  game_key game_key not null,
  ruleset_version text not null default 'v1',
  timezone text not null default 'UTC',
  format text not null, -- swiss/round_robin/single_elim...（先用 text，後續可 enum）
  round_count int not null default 1,
  -- 賽事時間區間：用於主辦排程、裁判指派的衝突檢查（MVP 先由應用層檢查不重疊）
  starts_at timestamptz null,
  ends_at timestamptz null,
  status tournament_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 賽事層級角色指派（例如：裁判/工作人員只被指派到特定賽事）
create table if not exists tournament_roles (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  user_id uuid not null references users(id) on delete restrict,
  role text not null, -- organizer/staff/referee...（先用 text，後續可 enum）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_tournament_role unique (tournament_id, user_id, role)
);

create index if not exists idx_tournament_roles_tournament on tournament_roles(tournament_id);
create index if not exists idx_tournament_roles_user on tournament_roles(user_id);

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  round_no int not null,
  table_no int null,
  player_a_id uuid not null,
  player_b_id uuid not null,
  status match_status not null default 'scheduled',
  -- result 以 JSONB 儲存「正規化結果」，其 schema 由 rules 外掛版本負責
  result jsonb null,
  started_at timestamptz null,
  finished_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matches_no_self_play check (player_a_id <> player_b_id),
  constraint matches_round_nonnegative check (round_no > 0)
);

create index if not exists idx_matches_tournament_round on matches(tournament_id, round_no);

-- ===== 周邊：Registration / Payment / Check-in =====
create table if not exists registrations (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  user_id uuid not null references users(id) on delete restrict,
  status registration_status not null default 'created',
  -- category/group 先用 text，後續可獨立表（組別、段位、年齡組）
  category_key text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_registration unique (tournament_id, user_id)
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references registrations(id) on delete cascade,
  status payment_status not null default 'initiated',
  provider_key text not null, -- e.g. 'mock', 'stripe', 'ecpay'...（供應商細節不可入侵核心流程）
  provider_ref text null,     -- 供應商回傳的外部參考
  amount_cents int not null default 0,
  currency text not null default 'TWD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_payments_registration on payments(registration_id);

create table if not exists checkins (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null unique references registrations(id) on delete cascade,
  status checkin_status not null default 'not_checked_in',
  checked_in_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


