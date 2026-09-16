import { NextRequest } from 'next/server';
import { verifyOwner } from '@/lib/server/auth';
import { createSuccessResponse, createErrorResponse } from '@/lib/server/errors';
import { getRequestsCol, getShopId } from '@/lib/server/repository';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await verifyOwner(req);
    const { id: requestId } = await params;
    const shopId = getShopId();

    const requestSnap = await getRequestsCol(shopId).doc(requestId).get();
    if (!requestSnap.exists) {
      return createErrorResponse('NOT_FOUND', 'ไม่พบประวัติคำขอนี้', 404);
    }

    const data = requestSnap.data();
    return createSuccessResponse(data?.response, requestId);
  } catch (err: unknown) {
    const error = err as { code?: string; message?: string; statusCode?: number };
    return createErrorResponse(
      error.code || 'INTERNAL_ERROR',
      error.message,
      error.statusCode || 500
    );
  }
}
