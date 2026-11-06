import { NextRequest } from 'next/server';
import sharp from 'sharp';
import { verifyOwner } from '@/lib/server/auth';
import { createSuccessResponse, createErrorResponse } from '@/lib/server/errors';
import { getShopId, getTruckPhotoRef } from '@/lib/server/repository';
import { TruckPhotoDoc, TruckPhotoMeta } from '@/lib/truck/types';
import { getAdminFirestore } from '@/lib/firebase/admin';
import { assertTruckWritable } from '@/lib/server/truck-control';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const owner = await verifyOwner(req);
    const contentType = req.headers.get('content-type') || '';

    let inputBuffer: Buffer;
    let requestId: string;

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      if (!file) {
        return createErrorResponse('INVALID_INPUT', 'กรุณาเลือกไฟล์รูปภาพ', 422);
      }
      inputBuffer = Buffer.from(await file.arrayBuffer());
      requestId = (formData.get('requestId') as string) || `tp_${Date.now()}`;
    } else {
      const body = await req.json();
      const { base64Data, requestId: reqId } = body;
      requestId = reqId || `tp_${Date.now()}`;

      if (!base64Data || typeof base64Data !== 'string') {
        return createErrorResponse('INVALID_INPUT', 'กรุณาส่งข้อมูลรูปภาพ', 422);
      }
      const cleanBase64 = base64Data.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
      inputBuffer = Buffer.from(cleanBase64, 'base64');
    }

    if (inputBuffer.length === 0) {
      return createErrorResponse('INVALID_INPUT', 'ไฟล์รูปภาพว่างเปล่า', 422);
    }

    if (inputBuffer.length > 10 * 1024 * 1024) {
      return createErrorResponse('INVALID_INPUT', 'ขนาดไฟล์รูปภาพเกินกำหนด (ไม่เกิน 10 MB)', 422);
    }

    let initialMeta: sharp.Metadata;
    let webpBuffer: Buffer;
    let finalMeta: sharp.Metadata;

    try {
      const initialImage = sharp(inputBuffer);
      initialMeta = await initialImage.metadata();

      if (!initialMeta.width || !initialMeta.height || initialMeta.width * initialMeta.height > 30_000_000) {
        return createErrorResponse('INVALID_INPUT', 'ความละเอียดของรูปภาพสูงเกินไป', 422);
      }

      // Process image with sharp: auto-rotate, resize within 1280x1280, webp quality 78
      webpBuffer = await sharp(inputBuffer)
        .rotate()
        .resize(1280, 1280, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 78 })
        .toBuffer();

      // Enforce 250KB limit: adaptive compression if needed
      if (webpBuffer.length > 250 * 1024) {
        webpBuffer = await sharp(inputBuffer)
          .rotate()
          .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 60 })
          .toBuffer();
      }

      if (webpBuffer.length > 250 * 1024) {
        return createErrorResponse('INVALID_INPUT', 'ขนาดรูปภาพเกินกำหนด 250 KB หลังการบีบอัด', 422);
      }

      finalMeta = await sharp(webpBuffer).metadata();
    } catch {
      return createErrorResponse('INVALID_INPUT', 'ไฟล์รูปภาพไม่ถูกต้องหรือไม่รองรับ', 422);
    }
    const photoId = `tp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const sizeKb = Math.round(webpBuffer.length / 1024);
    const now = new Date().toISOString();

    const photoDoc: TruckPhotoDoc = {
      photoId,
      data: webpBuffer.toString('base64'),
      contentType: 'image/webp',
      sizeKb,
      width: finalMeta.width || 0,
      height: finalMeta.height || 0,
      createdAt: now,
      updatedBy: owner.uid
    };

    const shopId = getShopId();
    await getAdminFirestore().runTransaction(async tx => {
      await assertTruckWritable(tx, shopId);
      tx.set(getTruckPhotoRef(photoId, shopId), photoDoc);
    });

    const result: TruckPhotoMeta = {
      photoId,
      sizeKb,
      width: finalMeta.width || 0,
      height: finalMeta.height || 0,
      contentType: 'image/webp',
      createdAt: now
    };

    return createSuccessResponse(result, requestId);
  } catch (err: unknown) {
    const error = err as { code?: string; message?: string; statusCode?: number };
    return createErrorResponse(error.code || 'INTERNAL_ERROR', error.message, error.statusCode || 500);
  }
}
