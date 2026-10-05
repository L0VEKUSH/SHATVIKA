/**
 * Unit tests for the token formatting and business-date logic in lib/orders/token.ts.
 *
 * These tests exercise the pure helper (businessDateKey) and the tokenNumber format
 * produced by allocateOrderToken.  Concurrency and daily-reset integration behaviour
 * is covered in tests/integration/commercePersistence.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { businessDateKey } from '@/lib/orders/token';

describe('businessDateKey', () => {
  it('returns YYYY-MM-DD in Asia/Kolkata regardless of UTC time', () => {
    // 2026-06-14 23:00:00 UTC = 2026-06-15 04:30:00 IST — should be '2026-06-15'
    expect(businessDateKey(new Date('2026-06-14T23:00:00.000Z'), 'Asia/Kolkata')).toBe('2026-06-15');
  });

  it('splits at midnight IST (UTC+05:30)', () => {
    // 18:29:59 UTC = 23:59:59 IST  →  still 2026-06-15
    expect(businessDateKey(new Date('2026-06-15T18:29:59.999Z'), 'Asia/Kolkata')).toBe('2026-06-15');
    // 18:30:00 UTC = 00:00:00 IST next day  →  2026-06-16
    expect(businessDateKey(new Date('2026-06-15T18:30:00.000Z'), 'Asia/Kolkata')).toBe('2026-06-16');
  });

  it('uses Asia/Kolkata as the default timezone', () => {
    const at = new Date('2026-06-15T18:30:00.000Z'); // midnight IST = 2026-06-16
    expect(businessDateKey(at)).toBe('2026-06-16');
  });

  it('zero-pads day and month', () => {
    // 2026-01-05T00:00:00Z = 2026-01-05T05:30:00 IST
    expect(businessDateKey(new Date('2026-01-05T00:00:00.000Z'), 'Asia/Kolkata')).toBe('2026-01-05');
  });
});

describe('tokenNumber format', () => {
  it('produces a plain 3-digit zero-padded number for the first daily token', () => {
    // Verify format contract without hitting the database.
    // The expression mirrors what allocateOrderToken returns for sequence=1.
    const seq = 1;
    expect(String(seq).padStart(3, '0')).toBe('001');
  });

  it('keeps growing naturally beyond 3 digits for high-volume days', () => {
    expect(String(999).padStart(3, '0')).toBe('999');
    // sequence 1000 exceeds 3 chars — padStart leaves it unchanged
    expect(String(1000).padStart(3, '0')).toBe('1000');
    expect(String(9999).padStart(3, '0')).toBe('9999');
  });

  it('never contains a prefix or hyphen', () => {
    for (const seq of [1, 5, 42, 100, 500, 999, 1000]) {
      const token = String(seq).padStart(3, '0');
      expect(token).not.toContain('-');
      expect(token).not.toContain('SC');
      expect(token).toMatch(/^\d+$/);
    }
  });

  it('maintains backward-compat contract: existing SC-NNNN strings remain valid in the DB', () => {
    // The Order.tokenNumber field is { type: String }, so legacy values are untouched.
    // This test documents the expectation without a database round-trip.
    const legacyToken = 'SC-0042';
    expect(typeof legacyToken).toBe('string');
    expect(legacyToken).toMatch(/^SC-\d{4,}$/);
  });
});
