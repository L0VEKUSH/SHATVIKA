import { describe, expect, it } from 'vitest';
import {
  assertPaise,
  legacyRupeesOrPaise,
  paiseToRupees,
  percentageOfPaise,
  rupeesToPaise,
} from '@/lib/money';

describe('integer-paise money helpers', () => {
  it.each([
    ['0', 0],
    ['0.01', 1],
    ['12.34', 1234],
    [12.345, 1235],
  ])('converts %s rupees using one half-up rounding step', (value, expected) => {
    expect(rupeesToPaise(value)).toBe(expected);
  });

  it.each(['1.001', '-1', '₹10', 'NaN'])('rejects unsafe textual money %s', (value) => {
    expect(() => rupeesToPaise(value)).toThrow();
  });

  it('rejects fractional, negative, infinite, and unsafe paise', () => {
    for (const value of [0.5, -1, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER]) {
      expect(() => assertPaise(value)).toThrow();
    }
  });

  it('rounds basis-point percentages deterministically', () => {
    expect(percentageOfPaise(101, 500)).toBe(5);
    expect(percentageOfPaise(110, 500)).toBe(6);
    expect(percentageOfPaise(999, 3333)).toBe(333);
  });

  it('uses an existing paise snapshot and otherwise converts legacy rupees', () => {
    expect(legacyRupeesOrPaise(1234, 99, 'total')).toBe(1234);
    expect(legacyRupeesOrPaise(undefined, 12.34, 'total')).toBe(1234);
    expect(paiseToRupees(1234)).toBe(12.34);
  });
});
