/**
 * Strict money calculation engine: all monetary amounts are integer satang.
 */

export function requireCondition(condition: boolean, code: string): asserts condition {
  if (!condition) {
    throw new Error(code);
  }
}

/**
 * Parses user input decimal string into satang integer.
 * Accepts "500", "500.5", "500.50".
 * Strictly rejects negative, empty, 1e6, NaN, Infinity, commas, or > 2 decimal places.
 */
export function moneySatang(text: string): number {
  requireCondition(typeof text === 'string' && /^(0|[1-9]\d{0,6})(\.\d{1,2})?$/.test(text), 'INVALID_MONEY');
  const parts = text.split('.');
  const whole = Number(parts[0]);
  const decimal = Number(((parts[1] || '') + '00').slice(0, 2));
  const amount = whole * 100 + decimal;
  requireCondition(Number.isSafeInteger(amount) && amount >= 0 && amount <= 100000000, 'INVALID_MONEY');
  return amount;
}

/**
 * Validates integer satang amount (0 to 1,000,000.00 THB = 100,000,000 satang).
 */
export function validateSatang(amount: number): number {
  requireCondition(
    Number.isSafeInteger(amount) && amount >= 0 && amount <= 100000000,
    'INVALID_MONEY'
  );
  return amount;
}

/**
 * Formats satang integer to Thai Baht string with 2 decimals and thousands separators.
 * e.g. 1450000 => "14,500.00"
 */
export function formatMoney(satang: number): string {
  const isNegative = satang < 0;
  const abs = Math.abs(satang);
  const baht = Math.floor(abs / 100);
  const st = abs % 100;
  const bahtStr = baht.toLocaleString('th-TH');
  const stStr = st.toString().padStart(2, '0');
  return `${isNegative ? '-' : ''}${bahtStr}.${stStr}`;
}

/**
 * Formats satang to decimal string suitable for input[type=text] or input[inputmode=decimal]
 * e.g. 50000 => "500.00"
 */
export function satangToDecimalString(satang: number): string {
  return (satang / 100).toFixed(2);
}
