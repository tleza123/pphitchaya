import { mutationData } from '@/lib/client/mutation-response';
import { getCurrentIdToken } from '@/lib/firebase/client';

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'เกิดข้อผิดพลาด');

async function authHeaders(extra: Record<string, string> = {}) {
  const headers = new Headers(extra);
  try {
    const token = await getCurrentIdToken().catch(() => null);
    if (token) headers.set('Authorization', `Bearer ${token}`);
  } catch {
    // Ignore missing Firebase auth in single-owner mode or SSR fallback.
  }
  return headers;
}

export const getJson = async (url: string) =>
  mutationData(await fetch(url, { cache: 'no-store', headers: await authHeaders() }), 'โหลดข้อมูลไม่สำเร็จ');

export const sendJson = async (url: string, method: string, body: object, requestId: string = crypto.randomUUID()) =>
  mutationData(
    await fetch(url, {
      method,
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ ...body, requestId })
    }),
    'บันทึกข้อมูลไม่สำเร็จ'
  );

export async function download(url: string, filename: string) {
  const res = await fetch(url, { headers: await authHeaders() });
  if (!res.ok) {
    const json = await res.json().catch(() => null);
    throw new Error(json?.error?.message || 'ดาวน์โหลดไม่สำเร็จ');
  }
  saveBlob(await res.blob(), filename);
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
