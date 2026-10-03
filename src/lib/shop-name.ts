export const DEFAULT_SHOP_NAME = 'ระบบเช็คชื่อพนักงาน';

/** Hide the old starter label without changing any saved shop profile. */
export function displayShopName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : '';
  return !name || /^DE\s+TEAM$/i.test(name) ? DEFAULT_SHOP_NAME : name;
}
