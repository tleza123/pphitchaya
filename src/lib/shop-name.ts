export const DEFAULT_SHOP_NAME = 'ระบบเช็กชื่อพนักงาน';

/** Normalize legacy starter labels for display. */
export function displayShopName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : '';
  return !name || /^DE\s+TEAM$/i.test(name) || name === 'ระบบเช็คชื่อพนักงาน' ? DEFAULT_SHOP_NAME : name;
}
