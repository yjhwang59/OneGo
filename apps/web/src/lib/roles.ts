/**
 * 角色衍生 helper（P0）：由 UserContext 的原始欄位算出「能不能看到某導覽/動作」。
 * 前端隱藏必須與後端 rbac 一致（見 docs/12-roles-and-permissions.md）；
 * 這裡只做「導覽可見性」的粗粒度判斷，細粒度授權仍以後端 403 為準。
 */

export type RoleSignals = {
  /** 平台總管時為 'platform_admin' */
  platformRole: string | null;
  /** 使用者在各主辦單位的成員角色（owner/admin/staff）去重後清單 */
  orgRoles: string[];
  /** 是否在任一賽事被指派為裁判 */
  isReferee: boolean;
};

export function isPlatformAdmin(s: RoleSignals): boolean {
  return s.platformRole === "platform_admin";
}

/** 是否為任一主辦單位成員（能進主辦後台） */
export function canAccessAdmin(s: RoleSignals): boolean {
  return s.orgRoles.length > 0 || isPlatformAdmin(s);
}

/** 是否為主辦單位 owner/admin（可管理成員、建立賽事等） */
export function isOrgManager(s: RoleSignals): boolean {
  return s.orgRoles.includes("owner") || s.orgRoles.includes("admin");
}

export function isOrgOwner(s: RoleSignals): boolean {
  return s.orgRoles.includes("owner");
}

export function isReferee(s: RoleSignals): boolean {
  return s.isReferee;
}
