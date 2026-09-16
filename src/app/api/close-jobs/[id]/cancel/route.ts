import { NextRequest } from 'next/server';
import { verifyOwner } from '@/lib/server/auth';
import { createSuccessResponse, createErrorResponse } from '@/lib/server/errors';
import {
  getShopId,
  getCloseJobsCol,
  getMonthRef,
  getFinanceControlRef,
  recordAudit
} from '@/lib/server/repository';
import { getAdminFirestore } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const owner = await verifyOwner(req);
    const { id: jobId } = await params;
    const shopId = getShopId();
    const db = getAdminFirestore();

    const jobRef = getCloseJobsCol(shopId).doc(jobId);
    const controlRef = getFinanceControlRef(shopId);

    const result = await db.runTransaction(async tx => {
      const jobSnap = await tx.get(jobRef);
      if (!jobSnap.exists) {
        throw new Error('NOT_FOUND');
      }

      const job = jobSnap.data() as any;
      if (job.status === 'COMPLETED') {
        throw new Error('ALREADY_COMPLETED');
      }

      const monthRef = getMonthRef(job.monthKey, shopId);
      const now = new Date().toISOString();

      // 1. Revert month state to OPEN
      tx.set(
        monthRef,
        {
          state: 'OPEN',
          updatedAt: now
        },
        { merge: true }
      );

      // 2. Release finance gate
      tx.set(
        controlRef,
        {
          closingMonth: null,
          activeCloseJobId: null,
          updatedAt: now
        },
        { merge: true }
      );

      // 3. Mark job cancelled
      tx.update(jobRef, {
        status: 'CANCELLED',
        updatedAt: now
      });

      recordAudit(
        tx,
        shopId,
        owner.uid,
        'CANCEL_CLOSE_JOB',
        job.monthKey,
        { jobId, state: 'CLOSING' },
        { jobId, state: 'OPEN', status: 'CANCELLED' }
      );

      return {
        jobId,
        monthKey: job.monthKey,
        status: 'CANCELLED'
      };
    });

    return createSuccessResponse(result);
  } catch (err: unknown) {
    const error = err as { code?: string; message?: string; statusCode?: number };
    if (error.message === 'ALREADY_COMPLETED') {
      return createErrorResponse('CONFLICT', 'งานปิดเดือนสำเร็จแล้ว ไม่สามารถยกเลิกได้', 409);
    }
    return createErrorResponse(
      error.code || 'INTERNAL_ERROR',
      error.message,
      error.statusCode || 500
    );
  }
}
