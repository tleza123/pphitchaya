import crypto from 'node:crypto';
import { EmployeeMonthResult } from './engine';

export const ALGORITHM_VERSION = '2026.1';

export interface EmployeeSnapshot {
  employeeId: string;
  name: string;
  position: string;
  counts: {
    full: number;
    half: number;
    absent: number;
    workedDays: number;
    paidDayUnits: number;
  };
  ratePeriods: { effectiveFrom: string; dailySatang: number }[];
  extras: { extraId: string; label: string; amountSatang: number; type?: 'BONUS' | 'DEDUCTION' }[];
  baseSatang: number;
  extraSatang: number;
  advanceSatang: number;
  deductionSatang: number;
  totalSatang: number;
  days: {
    dateKey: string;
    status: string;
    dailySatang?: number;
    amountSatang: number | null;
    advanceSatang?: number;
    deductionSatang?: number;
  }[];
  checksum: string;
  partsCount: number;
}

export interface ClosureManifest {
  closureId: string;
  monthKey: string;
  status: 'STAGING' | 'READY';
  sourceRevision: number;
  employeeIds: string[];
  totalsSatang: {
    base: number;
    extra: number;
    advance: number;
    deduction: number;
    total: number;
  };
  manifestHash: string;
  algorithmVersion: string;
  createdAt: string;
  closedAt?: string;
  closedBy?: string;
}

/**
 * Calculates SHA-256 hash of an object by serializing it deterministically.
 */
export function calculateChecksum(data: unknown): string {
  const json = JSON.stringify(data, Object.keys(data as object).sort());
  return crypto.createHash('sha256').update(json).digest('hex');
}

/**
 * Builds snapshot for an individual employee from their calculated result.
 */
export function buildEmployeeSnapshot(
  name: string,
  position: string,
  calc: EmployeeMonthResult
): EmployeeSnapshot {
  const baseData = {
    employeeId: calc.employeeId,
    name,
    position,
    counts: {
      full: calc.full,
      half: calc.half,
      absent: calc.absent,
      workedDays: calc.workedDays,
      paidDayUnits: calc.paidDayUnits
    },
    ratePeriods: calc.ratePeriods,
    extras: calc.extras,
    baseSatang: calc.baseSatang,
    extraSatang: calc.extraSatang,
    advanceSatang: calc.advanceSatang,
    deductionSatang: calc.deductionSatang || 0,
    totalSatang: calc.totalSatang,
    days: calc.days,
    partsCount: 1
  };

  const checksum = calculateChecksum(baseData);
  return {
    ...baseData,
    checksum
  };
}

/**
 * Builds closure manifest from an array of employee snapshots.
 */
export function buildClosureManifest(
  closureId: string,
  monthKey: string,
  sourceRevision: number,
  snapshots: EmployeeSnapshot[],
  actorUid: string
): ClosureManifest {
  let baseSum = 0;
  let extraSum = 0;
  let advanceSum = 0;
  let deductionSum = 0;
  let totalSum = 0;
  const employeeIds: string[] = [];

  for (const s of snapshots) {
    employeeIds.push(s.employeeId);
    baseSum += s.baseSatang;
    extraSum += s.extraSatang;
    advanceSum += s.advanceSatang || 0;
    deductionSum += s.deductionSatang || 0;
    totalSum += s.totalSatang;
  }

  const manifestData = {
    closureId,
    monthKey,
    sourceRevision,
    employeeIds: employeeIds.sort(),
    totalsSatang: {
      base: baseSum,
      extra: extraSum,
      advance: advanceSum,
      deduction: deductionSum,
      total: totalSum
    },
    algorithmVersion: ALGORITHM_VERSION,
    createdAt: new Date().toISOString()
  };

  const manifestHash = calculateChecksum(manifestData);

  return {
    ...manifestData,
    status: 'READY',
    manifestHash,
    closedAt: new Date().toISOString(),
    closedBy: actorUid
  };
}

