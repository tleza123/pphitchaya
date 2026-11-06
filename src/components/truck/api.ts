import { mutationData } from '@/lib/client/mutation-response';

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'เกิดข้อผิดพลาด');

export const getJson = async (url: string) =>
  mutationData(await fetch(url, { cache: 'no-store' }), 'โหลดข้อมูลไม่สำเร็จ');

export const sendJson = async (url: string, method: string, body: object, requestId: string = crypto.randomUUID()) =>
  mutationData(
    await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, requestId }) }),
    'บันทึกข้อมูลไม่สำเร็จ'
  );

export async function download(url: string, filename: string) {
  const res = await fetch(url);
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
