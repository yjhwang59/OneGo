import type { TournamentStatus } from './types';

export type StateGuardResult = { ok: true } | { ok: false; code: 'INVALID_STATE'; message: string };

export function canRegister(status: TournamentStatus): StateGuardResult {
  if (status === 'published' || status === 'checkin_open') return { ok: true };
  return { ok: false, code: 'INVALID_STATE', message: '此賽事狀態不可報名' };
}

export function canCheckIn(status: TournamentStatus): StateGuardResult {
  if (status === 'checkin_open') return { ok: true };
  return { ok: false, code: 'INVALID_STATE', message: '此賽事狀態不可報到' };
}

export function canGeneratePairing(status: TournamentStatus): StateGuardResult {
  if (status === 'pairing_ready' || status === 'in_progress') return { ok: true };
  return { ok: false, code: 'INVALID_STATE', message: '此賽事狀態不可編排' };
}

export function canSubmitResult(status: TournamentStatus): StateGuardResult {
  if (status === 'in_progress') return { ok: true };
  return { ok: false, code: 'INVALID_STATE', message: '此賽事狀態不可上傳結果' };
}

export function canTransitionTournament(from: TournamentStatus, to: TournamentStatus): StateGuardResult {
  if (from === 'cancelled') return { ok: false, code: 'INVALID_STATE', message: '賽事已取消，無法再變更狀態' };
  if (from === 'closed' && to !== 'closed') return { ok: false, code: 'INVALID_STATE', message: '賽事已結束，無法再變更狀態' };
  return { ok: true };
}




