-- 官方成績表（匯入既有賽事的原始名次/輔分/升段等，與 app 依對局重算的 standings 分開保存）
-- 用途：忠實保存主辦提供的最終成績（名次、四項輔分、勝場、加賽、升段組），供「查詢呈現每組比賽結果」使用。
-- 每筆對應一位棋手在某組的最終成績（以 registration 為主體）。

create table if not exists tournament_official_results (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  registration_id uuid not null references registrations(id) on delete cascade,
  category_key text not null,        -- 組別（= tournament_categories.key）
  seed_no int not null,              -- 該組內編號（原始戰績表序號）
  anon_code text not null,           -- 匿名代碼（來源資料）
  final_rank int null,               -- 名次
  tiebreak1 numeric null,            -- 第一輔分
  tiebreak2 numeric null,            -- 第二輔分
  tiebreak3 numeric null,            -- 第三輔分
  tiebreak4 numeric null,            -- 第四輔分
  wins int null,                     -- 勝場
  is_playoff boolean not null default false,  -- 加賽（升段附加賽）
  promoted_to text null,             -- 升段(組)：獲升至的組別，無則 null
  created_at timestamptz not null default now(),
  constraint uq_official_result unique (tournament_id, category_key, seed_no)
);

create index if not exists idx_official_results_tournament on tournament_official_results(tournament_id);
create index if not exists idx_official_results_registration on tournament_official_results(registration_id);
