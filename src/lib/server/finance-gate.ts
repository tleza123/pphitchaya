import 'server-only';
import * as admin from 'firebase-admin';

export interface FinanceControlDoc {
  revision: number;
  closingMonth: string | null;
  activeCloseJobId: string | null;
  updatedAt: string;
}

export interface MonthDoc {
  state: 'OPEN' | 'CLOSING' | 'CLOSED';
  revision: number;
  extrasRevision: number;
  currentClosureId: string | null;
  closedAt?: string;
  closedBy?: string;
}

/**
 * Validates finance control gate and month state inside transaction.
 */
export async function verifyFinanceGate(
  transaction: admin.firestore.Transaction,
  controlRef: admin.firestore.DocumentReference,
  monthRef: admin.firestore.DocumentReference,
  targetMonthKey: string
): Promise<{ control: FinanceControlDoc; month: MonthDoc | null }> {
  const controlSnap = await transaction.get(controlRef);
  const control = controlSnap.exists
    ? (controlSnap.data() as FinanceControlDoc)
    : { revision: 1, closingMonth: null, activeCloseJobId: null, updatedAt: new Date().toISOString() };

  if (control.closingMonth === targetMonthKey) {
    throw new Error('MONTH_CLOSING');
  }

  const monthSnap = await transaction.get(monthRef);
  const month = monthSnap.exists ? (monthSnap.data() as MonthDoc) : null;

  if (month) {
    if (month.state === 'CLOSED') {
      throw new Error('MONTH_CLOSED');
    }
    if (month.state === 'CLOSING') {
      throw new Error('MONTH_CLOSING');
    }
  }

  return { control, month };
}
