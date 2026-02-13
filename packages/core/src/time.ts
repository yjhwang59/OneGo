function parseIso(s?: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * 時間區間是否重疊（半開區間）
 * - 若任一端缺失或不可解析，回傳 false（MVP：不限制）
 */
export function intervalsOverlap(aStart?: string, aEnd?: string, bStart?: string, bEnd?: string): boolean {
  const as = parseIso(aStart);
  const ae = parseIso(aEnd);
  const bs = parseIso(bStart);
  const be = parseIso(bEnd);
  if (!as || !ae || !bs || !be) return false;
  return as < be && bs < ae;
}




