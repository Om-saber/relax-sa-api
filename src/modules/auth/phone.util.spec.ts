import { normalizeSaudiPhone, toE164 } from './phone.util';

describe('phone.util', () => {
  describe('normalizeSaudiPhone', () => {
    it('keeps a canonical local number', () => {
      expect(normalizeSaudiPhone('0501234567')).toBe('0501234567');
    });

    it('converts +966 format', () => {
      expect(normalizeSaudiPhone('+966501234567')).toBe('0501234567');
    });

    it('converts 00966 format', () => {
      expect(normalizeSaudiPhone('00966501234567')).toBe('0501234567');
    });

    it('adds the leading zero to a 9-digit mobile', () => {
      expect(normalizeSaudiPhone('501234567')).toBe('0501234567');
    });

    it('strips spaces and dashes', () => {
      expect(normalizeSaudiPhone('050-123 4567')).toBe('0501234567');
    });

    it('rejects landlines and garbage', () => {
      expect(() => normalizeSaudiPhone('0112345678')).toThrow('INVALID_SAUDI_PHONE');
      expect(() => normalizeSaudiPhone('hello')).toThrow('INVALID_SAUDI_PHONE');
    });
  });

  describe('toE164', () => {
    it('prefixes the country code', () => {
      expect(toE164('0501234567')).toBe('+966501234567');
    });
  });
});
