import { NextRequest } from 'next/server';
import { zipSync } from 'fflate';
import { verifyOwner } from '@/lib/server/auth';
import { createErrorResponse } from '@/lib/server/errors';
import { loadSalaryReports } from '@/lib/server/salary-reports';
import { createSalaryPdf } from '@/lib/server/salary-pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    await verifyOwner(req);
    const month = req.nextUrl.searchParams.get('month');
    const employeeId = req.nextUrl.searchParams.get('employeeId') || undefined;
    if (!month || (employeeId && !/^[\w-]{1,128}$/.test(employeeId))) return createErrorResponse('INVALID_EXPORT', 'ข้อมูลส่งออกไม่ถูกต้อง', 400);
    const reports = await loadSalaryReports(month, employeeId);
    if (!reports.length) return createErrorResponse('NOT_FOUND', 'ไม่มีพนักงานในเดือนที่เลือก', 404);
    const headers = { 'Cache-Control': 'private, no-store' };
    if (employeeId) {
      const pdf = await createSalaryPdf(reports[0]);
      return new Response(new Uint8Array(pdf), { headers: { ...headers, 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="salary-${month}.pdf"` } });
    }
    const files: Record<string, Uint8Array> = {};
    // Sequential PDF creation bounds memory and guarantees a complete ZIP or an error.
    for (const report of reports) {
      const name = (report.nickname || report.name || 'พนักงาน').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_');
      files[`เงินเดือน-${month}-${name}-${report.employeeId}.pdf`] = new Uint8Array(await createSalaryPdf(report));
    }
    return new Response(new Uint8Array(zipSync(files, { level: 1 })), { headers: { ...headers,
      'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="salary-all-${month}.zip"` } });
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string; statusCode?: number };
    return createErrorResponse(err.code || 'EXPORT_ERROR', err.message || 'ส่งออกไม่สำเร็จ', err.statusCode || 422);
  }
}
