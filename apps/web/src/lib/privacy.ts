/**
 * 隱私遮罩（P5）：公開名次榜/名單預設以「姓氏＋代號」方式遮罩，保護參賽者（含未成年）個資。
 * 集中於此，供 public 榜單/名單/results 套用；未來若有實名資料亦沿用同一規則。
 */

const CJK = /[㐀-鿿豈-﫿]/;

/**
 * 遮罩顯示名稱：
 * - 中文名：保留姓氏（首字），其餘以 ◯ 遮罩（最多 2 個）。例：「王小明」→「王◯◯」。
 * - 英文/代號：保留首字與末兩碼（代號），中間以 • 遮罩。例：「player-01」→「p•••01」。
 * - 過短（≤1 字）：原樣返回。
 */
export function maskName(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "—";
  const chars = [...s];
  if (chars.length <= 1) return s;

  if (CJK.test(s)) {
    return chars[0] + "◯".repeat(Math.min(chars.length - 1, 2));
  }

  if (chars.length <= 3) return chars[0] + "•".repeat(chars.length - 1);
  const first = chars[0];
  const last2 = chars.slice(-2).join("");
  return `${first}•••${last2}`;
}
