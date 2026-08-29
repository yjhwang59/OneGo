-- ELO 等級分系統（Phase 1）。可重複套用（idempotent）。
-- 依賴 otc.sql 已建立的：extension pgcrypto、type game_key、tables users/tournaments/matches。
-- 注意：users.id 為 text，故所有參照 users(id) 的欄位一律 text（非 uuid）。

-- 每棋種一組等級分配置
create table if not exists rating_configs (
  id uuid primary key default gen_random_uuid(),
  game_key game_key not null unique,
  default_rating int not null default 1500,
  k_factor_base int not null default 32,
  k_factor_tiers jsonb not null default '[
    {"ratingBelow": 2000, "k": 40},
    {"ratingBelow": 2400, "k": 32},
    {"ratingAbove": 2400, "k": 24}
  ]',
  min_rating int not null default 100,
  max_rating int null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 棋手等級分（每棋種獨立）
create table if not exists player_ratings (
  id uuid primary key default gen_random_uuid(),
  player_id text not null references users(id) on delete cascade,
  game_key game_key not null,
  current_rating int not null,
  peak_rating int not null,
  lowest_rating int not null,
  games_played int not null default 0,
  wins int not null default 0,
  draws int not null default 0,
  losses int not null default 0,
  last_calculated_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_player_game_rating unique (player_id, game_key)
);
create index if not exists idx_player_ratings_leaderboard on player_ratings(game_key, current_rating desc);

-- 等級分歷史（每次變化一列）
create table if not exists rating_history (
  id uuid primary key default gen_random_uuid(),
  player_id text not null references users(id) on delete cascade,
  game_key game_key not null,
  match_id uuid null references matches(id) on delete set null,
  tournament_id uuid null references tournaments(id) on delete set null,
  rating_before int not null,
  rating_after int not null,
  rating_change int not null,
  k_factor_used int not null,
  opponent_rating int null,
  match_result text null, -- 'win'/'draw'/'loss'
  calculated_at timestamptz not null default now()
);
create index if not exists idx_rating_history_player on rating_history(player_id, game_key, calculated_at desc);
create index if not exists idx_rating_history_tournament on rating_history(tournament_id);

-- 等級分計算任務（手動觸發；(tournament_id, game_key) 完成後鎖定重算）
create table if not exists rating_calculation_jobs (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  game_key game_key not null,
  status text not null default 'pending', -- pending/processing/completed/failed
  matches_processed int not null default 0,
  players_affected int not null default 0,
  started_at timestamptz null,
  completed_at timestamptz null,
  triggered_by text null references users(id) on delete set null,
  error_message text null,
  created_at timestamptz not null default now()
);
create index if not exists idx_rating_jobs_tournament on rating_calculation_jobs(tournament_id, game_key, status);
