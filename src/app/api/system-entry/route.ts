import { createHash, timingSafeEqual } from 'node:crypto';
import { createErrorResponse, createSuccessResponse } from '@/lib/server/errors';

/** The home-page chooser asks for a code; direct system URLs intentionally remain open. */
export async function POST(request: Request) {
  let body;
  try { body = await request.json(); } catch { return createErrorResponse('INVALID_INPUT', undefined, 422); }
  if (!['/attendance', '/truck'].includes(body?.destination) || typeof body?.password !== 'string' || !body.password || body.password.length > 128) {
    return createErrorResponse('INVALID_INPUT', undefined, 422);
  }
  const expected = process.env.SYSTEM_ENTRY_PASSWORD || '231050';
  const hash = (value: string) => createHash('sha256').update(value).digest();
  if (!timingSafeEqual(hash(body.password), hash(expected))) return createErrorResponse('INVALID_ENTRY_PASSWORD', 'รหัสไม่ถูกต้อง กรุณาลองใหม่', 401);
  return createSuccessResponse({ destination: body.destination });
}
