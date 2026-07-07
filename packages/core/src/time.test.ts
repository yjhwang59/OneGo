import { describe, it, expect } from 'vitest';
import { intervalsOverlap } from './time';

describe('intervalsOverlap', () => {
  it('returns true when intervals overlap', () => {
    // a: 10:00-12:00, b: 11:00-13:00
    expect(intervalsOverlap('2025-01-01T10:00:00Z', '2025-01-01T12:00:00Z', '2025-01-01T11:00:00Z', '2025-01-01T13:00:00Z')).toBe(
      true
    );
  });

  it('returns false when intervals do not overlap', () => {
    // a: 10:00-12:00, b: 12:00-14:00 (b starts when a ends)
    expect(intervalsOverlap('2025-01-01T10:00:00Z', '2025-01-01T12:00:00Z', '2025-01-01T12:00:00Z', '2025-01-01T14:00:00Z')).toBe(
      false
    );
  });

  it('returns false when any endpoint is missing or invalid', () => {
    expect(intervalsOverlap(undefined, '2025-01-01T12:00:00Z', '2025-01-01T11:00:00Z', '2025-01-01T13:00:00Z')).toBe(false);
    expect(intervalsOverlap('2025-01-01T10:00:00Z', undefined, '2025-01-01T11:00:00Z', '2025-01-01T13:00:00Z')).toBe(false);
    expect(intervalsOverlap('invalid', '2025-01-01T12:00:00Z', '2025-01-01T11:00:00Z', '2025-01-01T13:00:00Z')).toBe(false);
  });
});
