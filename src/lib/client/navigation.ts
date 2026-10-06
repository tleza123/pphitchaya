export interface NavigationState {
  attendanceNavigation?: Record<string, string | boolean | null>;
  attendanceDrafts?: Record<string, string>;
}

export function hasNavigationDetail(state: NavigationState | null): boolean {
  return Object.values(state?.attendanceNavigation || {}).some(value =>
    value !== null && value !== false && value !== 'all' && value !== 'list');
}

export function matchesReportSelection(current: { employeeId: string | null; month: string }, employeeId: string, month: string) {
  return current.employeeId === employeeId && current.month === month;
}
