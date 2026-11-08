/** Normalizes a Saudi mobile number to the canonical local format: 05XXXXXXXX */
export function normalizeSaudiPhone(input: string): string {
  let digits = String(input ?? '').replace(/\D/g, '');

  if (digits.startsWith('00966')) digits = digits.slice(2);
  if (digits.startsWith('966')) digits = `0${digits.slice(3)}`;
  if (digits.length === 9 && digits.startsWith('5')) digits = `0${digits}`;

  if (!/^05\d{8}$/.test(digits)) {
    throw new Error('INVALID_SAUDI_PHONE');
  }

  return digits;
}

/** 05XXXXXXXX -> +9665XXXXXXXX */
export function toE164(phone: string): string {
  return `+966${phone.replace(/^0/, '')}`;
}
