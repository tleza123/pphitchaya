import { AnalyticsEmployee, AnalyticsReport, ReportBucket, ReportPeriod, ReportTotals } from './analytics';
import { formatMoney } from './money';
import { formatThaiDate, formatThaiMonth } from './dates';

export type HealthStatus = 'healthy' | 'watch' | 'risk';
export type AlertSeverity = 'danger' | 'warning' | 'positive' | 'info';
export type EmployeeSegmentFilter = 'all' | 'reliable' | 'attendance_watch' | 'cash_watch';

export interface EmployeeInsight {
  employeeId: string;
  displayName: string;
  fullName: string;
  position: string;
  totals: ReportTotals;
  workdayCount: number;
  scheduledDays: number;
  attendanceRate: number;
  fullDayRate: number;
  absenceRate: number;
  advanceRatio: number;
  deductionRatio: number;
  bonusShare: number;
  payrollShare: number;
  effectiveDailyCostSatang: number;
  advanceEvents: number;
  longestStreak: number;
  isReliable: boolean;
  isAttendanceWatch: boolean;
  isCashWatch: boolean;
  isNegativeNet: boolean;
  primaryBadge: {
    label: string;
    tone: 'good' | 'warn' | 'danger' | 'neutral';
  };
}

export interface PositionBreakdown {
  position: string;
  headcount: number;
  grossSatang: number;
  baseSatang: number;
  extraSatang: number;
  advanceSatang: number;
  deductionSatang: number;
  totalSatang: number;
  scheduledDays: number;
  paidDayUnits: number;
  attendanceRate: number;
  payrollShare: number;
  avgDailyCostSatang: number;
}

export interface WeekdayPattern {
  weekday: number; // 1=Mon .. 6=Sat, 0=Sun
  shortLabel: string;
  fullLabel: string;
  dayCount: number;
  scheduledSlots: number;
  paidUnits: number;
  fullCount: number;
  halfCount: number;
  absentCount: number;
  attendanceRate: number;
  avgGrossSatang: number;
}

export interface HeatmapCell {
  key: string;
  label: string;
  shortLabel: string;
  weekday: number | null; // 0..6 for day mode
  weekIndex: number;
  scheduledSlots: number;
  full: number;
  half: number;
  absent: number;
  holiday: number;
  workedDays: number;
  paidDayUnits: number;
  grossSatang: number;
  advanceSatang: number;
  totalSatang: number;
  attendanceRate: number;
  isHolidayOnly: boolean;
  level: 0 | 1 | 2 | 3 | 4;
}

export interface ActionAlert {
  id: string;
  severity: AlertSeverity;
  category: string;
  title: string;
  detail: string;
  metricText: string;
  employeeId?: string;
}

export interface ExecutiveSummary {
  scheduledSlots: number;
  attendanceRate: number;
  targetAttendanceRate: number;
  fullDayRate: number;
  absenceRate: number;
  netToGrossRatio: number;
  advanceRatio: number;
  safeAdvanceThreshold: number;
  bonusShare: number;
  deductionRatio: number;
  avgCostPerShopWorkdaySatang: number;
  avgBasePerShopWorkdaySatang: number;
  effectiveCostPerPaidUnitSatang: number;
  healthStatus: HealthStatus;
  healthLabel: string;
  healthNote: string;
  daysWithAbsences: number;
  peakBucket: { key: string; label: string; attendanceRate: number; grossSatang: number } | null;
  lowestBucket: { key: string; label: string; attendanceRate: number; absent: number } | null;
}

export interface HrInsights {
  summary: ExecutiveSummary;
  employees: EmployeeInsight[];
  positions: PositionBreakdown[];
  weekdays: WeekdayPattern[];
  heatmapCells: HeatmapCell[];
  alerts: ActionAlert[];
  segmentCounts: Record<EmployeeSegmentFilter, number>;
}

const WEEKDAY_META: Array<{ weekday: number; shortLabel: string; fullLabel: string }> = [
  { weekday: 1, shortLabel: 'จ.', fullLabel: 'วันจันทร์' },
  { weekday: 2, shortLabel: 'อ.', fullLabel: 'วันอังคาร' },
  { weekday: 3, shortLabel: 'พ.', fullLabel: 'วันพุธ' },
  { weekday: 4, shortLabel: 'พฤ.', fullLabel: 'วันพฤหัสบดี' },
  { weekday: 5, shortLabel: 'ศ.', fullLabel: 'วันศุกร์' },
  { weekday: 6, shortLabel: 'ส.', fullLabel: 'วันเสาร์' },
  { weekday: 0, shortLabel: 'อา.', fullLabel: 'วันอาทิตย์' }
];

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function bucketAttendanceRate(bucket: ReportTotals): number {
  const scheduled = bucket.full + bucket.half + bucket.absent;
  if (scheduled <= 0) return 0;
  return round1((bucket.paidDayUnits / scheduled) * 100);
}

export function formatBucketLabel(key: string, period: ReportPeriod, short = false): string {
  if (period === 'year') return String(Number(key) + 543);
  if (period === 'month') return short ? formatThaiDate(`${key}-01`, { month: 'short' }) : formatThaiMonth(key);
  return formatThaiDate(key, short ? { day: 'numeric' } : { day: 'numeric', month: 'short', year: 'numeric' });
}

function isoWeekday(dateKey: string): number {
  const date = new Date(`${dateKey}T12:00:00+07:00`);
  return date.getUTCDay();
}

function monBasedRow(jsDay: number): number {
  return jsDay === 0 ? 6 : jsDay - 1;
}

function intensityFromRate(rate: number, scheduled: number): 0 | 1 | 2 | 3 | 4 {
  if (scheduled <= 0 || rate <= 0) return 0;
  if (rate >= 95) return 4;
  if (rate >= 80) return 3;
  if (rate >= 55) return 2;
  return 1;
}

function computeLongestFullStreak(buckets: ReportBucket[], period: ReportPeriod): number {
  if (period !== 'day') return 0;
  let maxStreak = 0;
  let current = 0;
  for (const row of buckets) {
    const scheduled = row.full + row.half + row.absent;
    if (scheduled === 0) continue; // holiday or non-workday does not break streak
    if (row.full > 0 && row.absent === 0 && row.half === 0) {
      current += 1;
      if (current > maxStreak) maxStreak = current;
    } else {
      current = 0;
    }
  }
  return maxStreak;
}

function buildEmployeeInsight(
  emp: AnalyticsEmployee,
  teamGrossSatang: number,
  period: ReportPeriod
): EmployeeInsight {
  const t = emp.totals;
  const scheduledDays = t.full + t.half + t.absent;
  const attendanceRate = scheduledDays > 0 ? round1((t.paidDayUnits / scheduledDays) * 100) : 0;
  const fullDayRate = scheduledDays > 0 ? round1((t.full / scheduledDays) * 100) : 0;
  const absenceRate = scheduledDays > 0 ? round1((t.absent / scheduledDays) * 100) : 0;
  const advanceRatio = t.grossSatang > 0
    ? round1((t.advanceSatang / t.grossSatang) * 100)
    : (t.advanceSatang > 0 ? 100 : 0);
  const deductionRatio = t.grossSatang > 0 ? round1((t.deductionSatang / t.grossSatang) * 100) : 0;
  const bonusShare = t.grossSatang > 0 ? round1((t.extraSatang / t.grossSatang) * 100) : 0;
  const payrollShare = teamGrossSatang > 0 ? round1((t.grossSatang / teamGrossSatang) * 100) : 0;
  const effectiveDailyCostSatang = t.paidDayUnits > 0 ? Math.round(t.grossSatang / t.paidDayUnits) : 0;
  const advanceEvents = emp.buckets.filter(b => b.advanceSatang > 0).length;
  const longestStreak = computeLongestFullStreak(emp.buckets, period);

  const isNegativeNet = t.totalSatang < 0;
  const isCashWatch = isNegativeNet || advanceRatio >= 30;
  const isAttendanceWatch = scheduledDays >= 2 && (attendanceRate < 85 || t.absent >= 2);
  const isReliable = scheduledDays >= 2 && attendanceRate >= 95 && t.absent === 0 && !isCashWatch;

  let primaryBadge: EmployeeInsight['primaryBadge'];
  if (isNegativeNet) {
    primaryBadge = { label: 'สุทธิติดลบ', tone: 'danger' };
  } else if (isCashWatch && isAttendanceWatch) {
    primaryBadge = { label: 'ต้องดูแลใกล้ชิด', tone: 'danger' };
  } else if (isCashWatch) {
    primaryBadge = { label: `เบิกสูง ${advanceRatio}%`, tone: 'warn' };
  } else if (isAttendanceWatch) {
    primaryBadge = { label: `มาทำงาน ${attendanceRate}%`, tone: 'warn' };
  } else if (isReliable) {
    primaryBadge = { label: 'สม่ำเสมอสูง', tone: 'good' };
  } else {
    primaryBadge = { label: 'ปกติ', tone: 'neutral' };
  }

  return {
    employeeId: emp.employeeId,
    displayName: emp.nickname || emp.name,
    fullName: emp.name,
    position: emp.position || 'ไม่ระบุตำแหน่ง',
    totals: t,
    workdayCount: emp.workdayCount || 0,
    scheduledDays,
    attendanceRate,
    fullDayRate,
    absenceRate,
    advanceRatio,
    deductionRatio,
    bonusShare,
    payrollShare,
    effectiveDailyCostSatang,
    advanceEvents,
    longestStreak,
    isReliable,
    isAttendanceWatch,
    isCashWatch,
    isNegativeNet,
    primaryBadge
  };
}

export function computeHrInsights(
  report: AnalyticsReport,
  selectedEmployeeId: string
): HrInsights {
  const selectedEmp = selectedEmployeeId !== 'all'
    ? report.employees.find(e => e.employeeId === selectedEmployeeId)
    : undefined;

  const scopeTotals = selectedEmp ? selectedEmp.totals : report.totals;
  const scopeRows = selectedEmp ? selectedEmp.buckets : report.buckets;
  const scopeWorkdays = (selectedEmp ? selectedEmp.workdayCount : report.workdayCount) || 0;
  const scopeEmployees = selectedEmp ? [selectedEmp] : report.employees;

  const teamGrossSatang = report.totals.grossSatang;
  const employeeInsights = scopeEmployees
    .map(emp => buildEmployeeInsight(emp, selectedEmp ? emp.totals.grossSatang : teamGrossSatang, report.period))
    .sort((a, b) => b.totals.grossSatang - a.totals.grossSatang || a.displayName.localeCompare(b.displayName, 'th'));

  // Position breakdown
  const posMap = new Map<string, {
    headcount: number;
    grossSatang: number;
    baseSatang: number;
    extraSatang: number;
    advanceSatang: number;
    deductionSatang: number;
    totalSatang: number;
    scheduledDays: number;
    paidDayUnits: number;
  }>();

  for (const emp of employeeInsights) {
    const pos = emp.position;
    const entry = posMap.get(pos) || {
      headcount: 0,
      grossSatang: 0,
      baseSatang: 0,
      extraSatang: 0,
      advanceSatang: 0,
      deductionSatang: 0,
      totalSatang: 0,
      scheduledDays: 0,
      paidDayUnits: 0
    };
    entry.headcount += 1;
    entry.grossSatang += emp.totals.grossSatang;
    entry.baseSatang += emp.totals.baseSatang;
    entry.extraSatang += emp.totals.extraSatang;
    entry.advanceSatang += emp.totals.advanceSatang;
    entry.deductionSatang += emp.totals.deductionSatang;
    entry.totalSatang += emp.totals.totalSatang;
    entry.scheduledDays += emp.scheduledDays;
    entry.paidDayUnits += emp.totals.paidDayUnits;
    posMap.set(pos, entry);
  }

  const scopeGross = scopeTotals.grossSatang;
  const positions: PositionBreakdown[] = [...posMap.entries()]
    .map(([position, v]) => ({
      position,
      headcount: v.headcount,
      grossSatang: v.grossSatang,
      baseSatang: v.baseSatang,
      extraSatang: v.extraSatang,
      advanceSatang: v.advanceSatang,
      deductionSatang: v.deductionSatang,
      totalSatang: v.totalSatang,
      scheduledDays: v.scheduledDays,
      paidDayUnits: v.paidDayUnits,
      attendanceRate: v.scheduledDays > 0 ? round1((v.paidDayUnits / v.scheduledDays) * 100) : 0,
      payrollShare: scopeGross > 0 ? round1((v.grossSatang / scopeGross) * 100) : 0,
      avgDailyCostSatang: v.paidDayUnits > 0 ? Math.round(v.grossSatang / v.paidDayUnits) : 0
    }))
    .sort((a, b) => b.grossSatang - a.grossSatang || a.position.localeCompare(b.position, 'th'));

  // Weekday breakdown (meaningful in 'day' period)
  const weekdayAcc = new Map<number, {
    dayCount: number;
    scheduledSlots: number;
    paidUnits: number;
    fullCount: number;
    halfCount: number;
    absentCount: number;
    grossSum: number;
  }>();
  for (const m of WEEKDAY_META) {
    weekdayAcc.set(m.weekday, {
      dayCount: 0,
      scheduledSlots: 0,
      paidUnits: 0,
      fullCount: 0,
      halfCount: 0,
      absentCount: 0,
      grossSum: 0
    });
  }

  const heatmapCells: HeatmapCell[] = [];
  let firstOffset = 0;
  if (report.period === 'day' && scopeRows.length > 0) {
    firstOffset = monBasedRow(isoWeekday(scopeRows[0].key));
  }

  let peakBucket: ExecutiveSummary['peakBucket'] = null;
  let lowestBucket: ExecutiveSummary['lowestBucket'] = null;
  let daysWithAbsences = 0;

  scopeRows.forEach((row, index) => {
    const scheduled = row.full + row.half + row.absent;
    const rate = bucketAttendanceRate(row);
    const isHolidayOnly = scheduled === 0 && row.holiday > 0;
    const label = formatBucketLabel(row.key, report.period);
    const shortLabel = formatBucketLabel(row.key, report.period, true);

    if (row.absent > 0) daysWithAbsences += 1;

    if (scheduled > 0) {
      if (
        !peakBucket ||
        row.grossSatang > peakBucket.grossSatang ||
        (row.grossSatang === peakBucket.grossSatang && rate > peakBucket.attendanceRate)
      ) {
        peakBucket = { key: row.key, label, attendanceRate: rate, grossSatang: row.grossSatang };
      }
      if (
        !lowestBucket ||
        rate < lowestBucket.attendanceRate ||
        (rate === lowestBucket.attendanceRate && row.absent > lowestBucket.absent)
      ) {
        lowestBucket = { key: row.key, label, attendanceRate: rate, absent: row.absent };
      }
    }

    let wd: number | null = null;
    let weekIndex = index;
    if (report.period === 'day') {
      wd = isoWeekday(row.key);
      weekIndex = Math.floor((firstOffset + index) / 7);
      if (scheduled > 0) {
        const acc = weekdayAcc.get(wd)!;
        acc.dayCount += 1;
        acc.scheduledSlots += scheduled;
        acc.paidUnits += row.paidDayUnits;
        acc.fullCount += row.full;
        acc.halfCount += row.half;
        acc.absentCount += row.absent;
        acc.grossSum += row.grossSatang;
      }
    }

    heatmapCells.push({
      key: row.key,
      label,
      shortLabel,
      weekday: wd,
      weekIndex,
      scheduledSlots: scheduled,
      full: row.full,
      half: row.half,
      absent: row.absent,
      holiday: row.holiday,
      workedDays: row.workedDays,
      paidDayUnits: row.paidDayUnits,
      grossSatang: row.grossSatang,
      advanceSatang: row.advanceSatang,
      totalSatang: row.totalSatang,
      attendanceRate: rate,
      isHolidayOnly,
      level: intensityFromRate(rate, scheduled)
    });
  });

  const weekdays: WeekdayPattern[] = WEEKDAY_META.map(meta => {
    const acc = weekdayAcc.get(meta.weekday)!;
    return {
      weekday: meta.weekday,
      shortLabel: meta.shortLabel,
      fullLabel: meta.fullLabel,
      dayCount: acc.dayCount,
      scheduledSlots: acc.scheduledSlots,
      paidUnits: acc.paidUnits,
      fullCount: acc.fullCount,
      halfCount: acc.halfCount,
      absentCount: acc.absentCount,
      attendanceRate: acc.scheduledSlots > 0 ? round1((acc.paidUnits / acc.scheduledSlots) * 100) : 0,
      avgGrossSatang: acc.dayCount > 0 ? Math.round(acc.grossSum / acc.dayCount) : 0
    };
  });

  // Executive Summary
  const scheduledSlots = scopeTotals.full + scopeTotals.half + scopeTotals.absent;
  const attendanceRate = scheduledSlots > 0 ? round1((scopeTotals.paidDayUnits / scheduledSlots) * 100) : 0;
  const fullDayRate = scheduledSlots > 0 ? round1((scopeTotals.full / scheduledSlots) * 100) : 0;
  const absenceRate = scheduledSlots > 0 ? round1((scopeTotals.absent / scheduledSlots) * 100) : 0;
  const netToGrossRatio = scopeGross > 0 ? round1(Math.max(0, Math.min(100, (scopeTotals.totalSatang / scopeGross) * 100))) : 0;
  const advanceRatio = scopeGross > 0
    ? round1((scopeTotals.advanceSatang / scopeGross) * 100)
    : (scopeTotals.advanceSatang > 0 ? 100 : 0);
  const bonusShare = scopeGross > 0 ? round1((scopeTotals.extraSatang / scopeGross) * 100) : 0;
  const deductionRatio = scopeGross > 0 ? round1((scopeTotals.deductionSatang / scopeGross) * 100) : 0;
  const avgCostPerShopWorkdaySatang = scopeWorkdays > 0 ? Math.round(scopeGross / scopeWorkdays) : 0;
  const avgBasePerShopWorkdaySatang = scopeWorkdays > 0 ? Math.round(scopeTotals.baseSatang / scopeWorkdays) : 0;
  const effectiveCostPerPaidUnitSatang = scopeTotals.paidDayUnits > 0 ? Math.round(scopeGross / scopeTotals.paidDayUnits) : 0;

  let healthStatus: HealthStatus = 'healthy';
  let healthLabel = 'สุขภาพทีมแข็งแรง';
  let healthNote = 'อัตราการมาทำงานและสัดส่วนเงินเบิกอยู่ในเกณฑ์ปลอดภัย';

  if (scheduledSlots === 0) {
    healthStatus = 'healthy';
    healthLabel = 'ยังไม่มีวันทำงานในช่วงนี้';
    healthNote = 'เลือกช่วงเวลาอื่นเพื่อดูแนวโน้มการมาทำงานและต้นทุนค่าแรง';
  } else if (scopeTotals.totalSatang < 0 || attendanceRate < 80 || advanceRatio >= 35) {
    healthStatus = 'risk';
    healthLabel = 'มีจุดเสี่ยงที่ต้องแก้ไข';
    healthNote = scopeTotals.totalSatang < 0
      ? 'พบยอดค่าจ้างสุทธิติดลบ ควรตรวจสอบเงินเบิกและรายการหักทันที'
      : attendanceRate < 80
        ? `อัตราการมาทำงานต่ำกว่าเกณฑ์ (${attendanceRate}%) เสี่ยงกระทบกำลังคนหน้าร้าน`
        : `สัดส่วนเงินเบิกล่วงหน้าสูง (${advanceRatio}%) ควรวางแผนสภาพคล่องและคุยเงื่อนไขการเบิก`;
  } else if (attendanceRate < 90 || advanceRatio >= 25) {
    healthStatus = 'watch';
    healthLabel = 'ควรติดตามใกล้ชิด';
    healthNote = attendanceRate < 90
      ? `อัตราการมาทำงานอยู่ที่ ${attendanceRate}% (เป้าหมาย 90%) ควรตรวจดูวันขาดและครึ่งวันรายบุคคล`
      : `เงินเบิกล่วงหน้าอยู่ที่ ${advanceRatio}% ของค่าแรงรวม ใกล้เพดานปลอดภัย 25%`;
  }

  // Actionable Alerts (CFO + Ops + Board + Plan)
  const alerts: ActionAlert[] = [];

  for (const emp of employeeInsights) {
    if (emp.isNegativeNet) {
      alerts.push({
        id: `neg-${emp.employeeId}`,
        severity: 'danger',
        category: 'สภาพคล่อง',
        title: `${emp.displayName} มียอดค่าจ้างสุทธิติดลบ`,
        detail: `เบิกล่วงหน้า ${formatMoney(emp.totals.advanceSatang)} และหัก ${formatMoney(emp.totals.deductionSatang)} เกินกว่าค่าแรงรวม ${formatMoney(emp.totals.grossSatang)} บาท`,
        metricText: `${formatMoney(emp.totals.totalSatang)} บาท`,
        employeeId: emp.employeeId
      });
    } else if (emp.isCashWatch) {
      alerts.push({
        id: `adv-${emp.employeeId}`,
        severity: 'warning',
        category: 'สภาพคล่อง',
        title: `${emp.displayName} เบิกล่วงหน้าสูงกว่าเกณฑ์`,
        detail: `เบิกไปแล้ว ${formatMoney(emp.totals.advanceSatang)} บาท จากค่าแรงรวม ${formatMoney(emp.totals.grossSatang)} บาท (${emp.advanceEvents} ครั้ง)`,
        metricText: `${emp.advanceRatio}% ของค่าแรง`,
        employeeId: emp.employeeId
      });
    }
  }

  for (const emp of employeeInsights) {
    if (emp.isAttendanceWatch) {
      alerts.push({
        id: `att-${emp.employeeId}`,
        severity: emp.attendanceRate < 75 ? 'danger' : 'warning',
        category: 'เวลาทำงาน',
        title: `${emp.displayName} มีอัตราการมาทำงานต่ำกว่าเป้า`,
        detail: `ขาด ${emp.totals.absent} วัน · ครึ่งวัน ${emp.totals.half} วัน จาก ${emp.scheduledDays} วันทำงาน ควรพูดคุยหาสาเหตุหรือจัดคนสำรอง`,
        metricText: `มา ${emp.attendanceRate}%`,
        employeeId: emp.employeeId
      });
    }
  }

  // Weekday bottleneck alert in day mode
  if (report.period === 'day') {
    const activeWeekdays = weekdays.filter(w => w.scheduledSlots >= 2);
    const weakest = [...activeWeekdays].sort((a, b) => a.attendanceRate - b.attendanceRate || b.absentCount - a.absentCount)[0];
    if (weakest && weakest.attendanceRate < 85 && (weakest.absentCount > 0 || weakest.halfCount > 0)) {
      alerts.push({
        id: `weekday-${weakest.weekday}`,
        severity: 'warning',
        category: 'ตารางกะงาน',
        title: `${weakest.fullLabel} มีอัตราการมาทำงานต่ำสุด`,
        detail: `ขาดรวม ${weakest.absentCount} ครั้ง และครึ่งวัน ${weakest.halfCount} ครั้ง ควรเตรียมแผนหมุนเวียนคนใน${weakest.fullLabel}`,
        metricText: `มา ${weakest.attendanceRate}%`
      });
    }
  }

  // Key-person concentration check (Board / Ops risk when >= 3 employees)
  if (!selectedEmp && employeeInsights.length >= 3) {
    const topEarner = employeeInsights[0];
    if (topEarner && topEarner.payrollShare >= 45) {
      alerts.push({
        id: `conc-${topEarner.employeeId}`,
        severity: 'info',
        category: 'ความเสี่ยงกำลังคน',
        title: `งบค่าแรงกระจุกตัวที่ ${topEarner.displayName}`,
        detail: `คิดเป็น ${topEarner.payrollShare}% ของงบค่าแรงทั้งหมด (${topEarner.position}) ควรเตรียมคนสำรองงานหลักหากลาหยุด`,
        metricText: `${topEarner.payrollShare}% ของงบ`,
        employeeId: topEarner.employeeId
      });
    }
  }

  // Positive recognition alerts
  const reliableEmployees = employeeInsights.filter(e => e.isReliable);
  if (reliableEmployees.length > 0) {
    const names = reliableEmployees.slice(0, 3).map(e => e.displayName).join(', ');
    const more = reliableEmployees.length > 3 ? ` และอีก ${reliableEmployees.length - 3} คน` : '';
    alerts.push({
      id: 'reliable-team',
      severity: 'positive',
      category: 'จุดแข็งทีม',
      title: `พนักงานสม่ำเสมอสูง ${reliableEmployees.length} คน`,
      detail: `${names}${more} มาทำงานตั้งแต่ 95% ขึ้นไปโดยไม่ขาดงาน เหมาะแก่การรักษาคนและพิจารณาแรงจูงใจ`,
      metricText: `${reliableEmployees.length}/${employeeInsights.length} คน`,
      employeeId: reliableEmployees.length === 1 ? reliableEmployees[0].employeeId : undefined
    });
  }

  const severityOrder: Record<AlertSeverity, number> = { danger: 0, warning: 1, info: 2, positive: 3 };
  alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  const segmentCounts: Record<EmployeeSegmentFilter, number> = {
    all: employeeInsights.length,
    reliable: employeeInsights.filter(e => e.isReliable).length,
    attendance_watch: employeeInsights.filter(e => e.isAttendanceWatch).length,
    cash_watch: employeeInsights.filter(e => e.isCashWatch).length
  };

  return {
    summary: {
      scheduledSlots,
      attendanceRate,
      targetAttendanceRate: 90,
      fullDayRate,
      absenceRate,
      netToGrossRatio,
      advanceRatio,
      safeAdvanceThreshold: 25,
      bonusShare,
      deductionRatio,
      avgCostPerShopWorkdaySatang,
      avgBasePerShopWorkdaySatang,
      effectiveCostPerPaidUnitSatang,
      healthStatus,
      healthLabel,
      healthNote,
      daysWithAbsences,
      peakBucket,
      lowestBucket
    },
    employees: employeeInsights,
    positions,
    weekdays,
    heatmapCells,
    alerts: alerts.slice(0, 6),
    segmentCounts
  };
}
