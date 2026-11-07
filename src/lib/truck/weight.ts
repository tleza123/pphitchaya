/** Weight is informational. It is never an input to money calculations. */
export function validateWeightKg(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('INVALID_WEIGHT');
  return value;
}

/** Parse decimal tons exactly, without rounding or binary floating point conversion. */
export function parseTonsToKg(value: string): number | null {
  const text=value.trim();
  if (!text) return null;
  if (!/^\d+(?:\.\d{1,3})?$/.test(text)) throw new Error('INVALID_WEIGHT');
  const [whole, fraction='']=text.split('.');
  const kg=BigInt(whole)*1000n+BigInt(fraction.padEnd(3,'0'));
  if (kg>BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('INVALID_WEIGHT');
  return Number(kg);
}

/** Returns tons with three decimals; null remains visibly unknown. */
export function formatWeightTons(value: unknown): string {
  const kg=validateWeightKg(value);
  if (kg===null) return 'ยังไม่ระบุ';
  return `${Math.floor(kg/1000)}.${String(kg%1000).padStart(3,'0')}`;
}
