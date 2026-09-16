import { NextRequest } from 'next/server';
import { verifyOwner } from '@/lib/server/auth';
import { createSuccessResponse, createErrorResponse } from '@/lib/server/errors';
import { getCloseJobsCol, getShopId } from '@/lib/server/repository';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await verifyOwner(req);
    const { id: jobId } = await params;
    const shopId = getShopId();

    const jobSnap = await getCloseJobsCol(shopId).doc(jobId).get();
    if (!jobSnap.exists) {
      return createErrorResponse('NOT_FOUND', 'ไม่พบงานปิดเดือนนี้', 404);
    }

    const data = jobSnap.data();
    return createSuccessResponse(data);
  } catch (err: unknown) {
    const error = err as { code?: string; message?: string; statusCode?: number };
    return createErrorResponse(
      error.code || 'INTERNAL_ERROR',
      error.message,
      error.statusCode || 500
    );
  }
}
