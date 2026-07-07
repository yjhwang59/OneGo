import { describe, it, expect } from 'vitest';
import {
  canRegister,
  canCheckIn,
  canGeneratePairing,
  canSubmitResult,
  canTransitionTournament,
} from './state-machine';
import type { TournamentStatus } from './types';

describe('canRegister', () => {
  it('allows published and checkin_open', () => {
    expect(canRegister('published')).toEqual({ ok: true });
    expect(canRegister('checkin_open')).toEqual({ ok: true });
  });

  it('rejects other statuses', () => {
    const rejected: TournamentStatus[] = ['draft', 'pairing_ready', 'in_progress', 'closed', 'cancelled'];
    for (const s of rejected) {
      expect(canRegister(s)).toEqual({ ok: false, code: 'INVALID_STATE', message: '此賽事狀態不可報名' });
    }
  });
});

describe('canCheckIn', () => {
  it('allows only checkin_open', () => {
    expect(canCheckIn('checkin_open')).toEqual({ ok: true });
  });

  it('rejects other statuses', () => {
    const rejected: TournamentStatus[] = ['draft', 'published', 'pairing_ready', 'in_progress', 'closed', 'cancelled'];
    for (const s of rejected) {
      expect(canCheckIn(s)).toEqual({ ok: false, code: 'INVALID_STATE', message: '此賽事狀態不可報到' });
    }
  });
});

describe('canGeneratePairing', () => {
  it('allows pairing_ready and in_progress', () => {
    expect(canGeneratePairing('pairing_ready')).toEqual({ ok: true });
    expect(canGeneratePairing('in_progress')).toEqual({ ok: true });
  });

  it('rejects other statuses', () => {
    const rejected: TournamentStatus[] = ['draft', 'published', 'checkin_open', 'closed', 'cancelled'];
    for (const s of rejected) {
      expect(canGeneratePairing(s)).toEqual({ ok: false, code: 'INVALID_STATE', message: '此賽事狀態不可編排' });
    }
  });
});

describe('canSubmitResult', () => {
  it('allows only in_progress', () => {
    expect(canSubmitResult('in_progress')).toEqual({ ok: true });
  });

  it('rejects other statuses', () => {
    const rejected: TournamentStatus[] = ['draft', 'published', 'checkin_open', 'pairing_ready', 'closed', 'cancelled'];
    for (const s of rejected) {
      expect(canSubmitResult(s)).toEqual({ ok: false, code: 'INVALID_STATE', message: '此賽事狀態不可上傳結果' });
    }
  });
});

describe('canTransitionTournament', () => {
  it('rejects from cancelled', () => {
    const toAll: TournamentStatus[] = ['draft', 'published', 'checkin_open', 'pairing_ready', 'in_progress', 'closed', 'cancelled'];
    for (const to of toAll) {
      expect(canTransitionTournament('cancelled', to)).toEqual({
        ok: false,
        code: 'INVALID_STATE',
        message: '賽事已取消，無法再變更狀態',
      });
    }
  });

  it('rejects from closed to any non-closed', () => {
    expect(canTransitionTournament('closed', 'draft')).toEqual({
      ok: false,
      code: 'INVALID_STATE',
      message: '賽事已結束，無法再變更狀態',
    });
    expect(canTransitionTournament('closed', 'published')).toEqual({
      ok: false,
      code: 'INVALID_STATE',
      message: '賽事已結束，無法再變更狀態',
    });
  });

  it('allows from closed to closed', () => {
    expect(canTransitionTournament('closed', 'closed')).toEqual({ ok: true });
  });

  it('allows other transitions (MVP guard is minimal)', () => {
    expect(canTransitionTournament('draft', 'published')).toEqual({ ok: true });
    expect(canTransitionTournament('published', 'checkin_open')).toEqual({ ok: true });
    expect(canTransitionTournament('in_progress', 'closed')).toEqual({ ok: true });
  });
});
