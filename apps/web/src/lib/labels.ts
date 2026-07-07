/**
 * 集中對照表（P0）：棋種與各狀態的「文案 + 語意色調」唯一來源。
 * 全站顯示狀態一律經由此檔 + <StatusBadge>，確保同一 status 值到處同色同字。
 *
 * status 值定義見 docs/02-state-machines.md。
 */

export type Tone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "purple"
  | "muted"
  | "danger";

export type GameKey = "go" | "chess" | "xiangqi" | "gomoku";

// ── 棋種 ──────────────────────────────────────────────
export const GAME_LABEL: Record<string, string> = {
  go: "圍棋",
  chess: "西洋棋",
  xiangqi: "象棋",
  gomoku: "五子棋",
};

export function gameLabel(key: string | null | undefined): string {
  if (!key) return "—";
  return GAME_LABEL[key] ?? key;
}

/** 棋種對應的 CSS 變數（供小圓點著色） */
export function gameColorVar(key: string | null | undefined): string {
  switch (key) {
    case "go":
    case "chess":
    case "xiangqi":
    case "gomoku":
      return `var(--game-${key})`;
    default:
      return "var(--muted-fg)";
  }
}

// ── 狀態對照（文案 + 色調） ────────────────────────────
type StatusMeta = { label: string; tone: Tone };

export const TOURNAMENT_STATUS: Record<string, StatusMeta> = {
  draft: { label: "草稿", tone: "neutral" },
  published: { label: "已發布", tone: "info" },
  checkin_open: { label: "開放報到", tone: "success" },
  pairing_ready: { label: "可編排", tone: "warning" },
  in_progress: { label: "進行中", tone: "purple" },
  closed: { label: "已結束", tone: "muted" },
  cancelled: { label: "已取消", tone: "danger" },
};

export const REGISTRATION_STATUS: Record<string, StatusMeta> = {
  created: { label: "已建立", tone: "neutral" },
  awaiting_payment: { label: "待繳費", tone: "warning" },
  paid: { label: "已繳費", tone: "success" },
  cancelled: { label: "已取消", tone: "danger" },
  refunded: { label: "已退款", tone: "muted" },
};

export const PAYMENT_STATUS: Record<string, StatusMeta> = {
  initiated: { label: "已建立", tone: "neutral" },
  pending: { label: "處理中", tone: "warning" },
  succeeded: { label: "成功", tone: "success" },
  failed: { label: "失敗", tone: "danger" },
  cancelled: { label: "已取消", tone: "muted" },
  refunded: { label: "已退款", tone: "muted" },
};

export const CHECKIN_STATUS: Record<string, StatusMeta> = {
  not_checked_in: { label: "未報到", tone: "neutral" },
  checked_in: { label: "已報到", tone: "success" },
  withdrawn: { label: "退賽", tone: "danger" },
  replaced: { label: "已替補", tone: "muted" },
};

export const MATCH_STATUS: Record<string, StatusMeta> = {
  scheduled: { label: "已排定", tone: "neutral" },
  playing: { label: "進行中", tone: "purple" },
  finished: { label: "已結束", tone: "success" },
  void: { label: "作廢", tone: "muted" },
};

export type StatusDomain =
  | "tournament"
  | "registration"
  | "payment"
  | "checkin"
  | "match";

const DOMAIN_MAP: Record<StatusDomain, Record<string, StatusMeta>> = {
  tournament: TOURNAMENT_STATUS,
  registration: REGISTRATION_STATUS,
  payment: PAYMENT_STATUS,
  checkin: CHECKIN_STATUS,
  match: MATCH_STATUS,
};

/** 取得某狀態值的「文案 + 色調」；未知值回退為原字串 + muted。 */
export function statusMeta(
  domain: StatusDomain,
  value: string | null | undefined
): StatusMeta {
  if (!value) return { label: "—", tone: "muted" };
  return DOMAIN_MAP[domain][value] ?? { label: value, tone: "muted" };
}

// ── 角色文案 ──────────────────────────────────────────
export const ORG_ROLE_LABEL: Record<string, string> = {
  owner: "擁有者",
  admin: "管理員",
  staff: "工作人員",
};

export const TOURNAMENT_ROLE_LABEL: Record<string, string> = {
  organizer: "賽事負責人",
  staff: "工作人員",
  referee: "裁判",
};
