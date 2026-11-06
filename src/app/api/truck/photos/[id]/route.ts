import { NextRequest, NextResponse } from 'next/server';
import { verifyOwner } from '@/lib/server/auth';
import { createSuccessResponse, createErrorResponse } from '@/lib/server/errors';
import { getShopId, getTruckPhotoRef } from '@/lib/server/repository';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await verifyOwner(req);
    const { id: photoId } = await params;
    const shopId = getShopId();

    const photoDoc = await getTruckPhotoRef(photoId, shopId).get();
    if (!photoDoc.exists) {
      return createErrorResponse('NOT_FOUND', 'ไม่พบรูปภาพหลักฐาน', 404);
    }

    const photoData = photoDoc.data();
    if (!photoData?.data) {
      return createErrorResponse('NOT_FOUND', 'ข้อมูลรูปภาพไม่สมบูรณ์', 404);
    }

    const buffer = Buffer.from(photoData.data, 'base64');
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': photoData.contentType || 'image/webp',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Length': buffer.length.toString()
      }
    });
  } catch (err: unknown) {
    const error = err as { code?: string; message?: string; statusCode?: number };
    return createErrorResponse(error.code || 'INTERNAL_ERROR', error.message, error.statusCode || 500);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await verifyOwner(req);
    const { id: photoId } = await params;
    const shopId = getShopId();

    const photoRef = getTruckPhotoRef(photoId, shopId);
    await photoRef.delete();

    return createSuccessResponse({ deleted: true, photoId });
  } catch (err: unknown) {
    const error = err as { code?: string; message?: string; statusCode?: number };
    return createErrorResponse(error.code || 'INTERNAL_ERROR', error.message, error.statusCode || 500);
  }
}
