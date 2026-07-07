/** 合併 className，過濾 falsy。輕量版，避免額外相依。 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
