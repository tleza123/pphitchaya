import { NextResponse } from 'next/server';

export interface ApiErrorDetail {
  code: string;
  message: string;
  fields?: Record<string, string>;
  requestId?: string;
}

export interface ApiSuccessResponse<T> {
  ok: true;
  data: T;
  requestId?: string;
  serverTime: string;
}

export interface ApiErrorResponse {
  ok: false;
  error: ApiErrorDetail;
}

export const THAI_ERROR_MESSAGES: Record<string, string> = {
  AUTH_REQUIRED: 'กรุณาเข้าสู่ระบบด้วยบัญชีผู้ดูแล',
  FORBIDDEN: 'บัญชีนี้ไม่มีสิทธิ์เข้าถึงระบบเงินเดือน',
  INVALID_INPUT: 'ข้อมูลที่ระบุไม่ถูกต้อง',
  INVALID_DATE: 'รูปแบบวันที่ไม่ถูกต้อง',
  INVALID_MONTH: 'รูปแบบเดือนไม่ถูกต้อง',
  INVALID_MONEY: 'จำนวนเงินไม่ถูกต้อง กรุณาระบุตัวเลขไม่เกิน 2 ทศนิยม',
  CONFLICT: 'ข้อมูลมีการเปลี่ยนแปลงแล้ว กรุณาโหลดข้อมูลล่าสุดและลองอีกครั้ง',
  MONTH_CLOSED: 'เดือนนี้ปิดแล้ว ไม่สามารถแก้ไขได้',
  MONTH_CLOSING: 'ระบบกำลังดำเนินการปิดเดือน กรุณารอสักครู่',
  REQUEST_ID_REUSED: 'requestId นี้เคยถูกใช้กับข้อมูลชุดอื่นแล้ว',
  DUPLICATE_RATE: 'มีอัตราค่าแรงในวันเดียวกันอยู่แล้ว',
  MISSING_RATE: 'ไม่พบอัตราค่าแรงสำหรับวันที่ระบุ',
  NOT_FOUND: 'ไม่พบข้อมูลที่ต้องการ',
  BUSY: 'ระบบกำลังบันทึกข้อมูล กรุณาลองใหม่อีกครั้ง',
  UNAVAILABLE: 'ไม่สามารถเชื่อมต่อฐานข้อมูลได้',
  INTERNAL_ERROR: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์'
};

export function createSuccessResponse<T>(data: T, requestId?: string): NextResponse<ApiSuccessResponse<T>> {
  return NextResponse.json(
    {
      ok: true,
      data,
      requestId,
      serverTime: new Date().toISOString()
    },
    {
      headers: {
        'Cache-Control': 'private, no-store, no-cache, must-revalidate'
      }
    }
  );
}

export function createErrorResponse(
  code: string,
  customMessage?: string,
  statusCode = 400,
  fields?: Record<string, string>,
  requestId?: string
): NextResponse<ApiErrorResponse> {
  const message = customMessage || THAI_ERROR_MESSAGES[code] || THAI_ERROR_MESSAGES.INTERNAL_ERROR;

  return NextResponse.json(
    {
      ok: false,
      error: {
        code,
        message,
        fields,
        requestId
      }
    },
    {
      status: statusCode,
      headers: {
        'Cache-Control': 'private, no-store, no-cache, must-revalidate'
      }
    }
  );
}
