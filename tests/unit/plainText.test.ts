import { describe, expect, it } from 'vitest';
import { toPlainText } from '@/lib/plainText';

describe('toPlainText', () => {
  it('preserves normal text', () => {
    expect(toPlainText('A tasty meal')).toBe('A tasty meal');
  });

  it('strips HTML-like input while preserving its text content', () => {
    expect(toPlainText('<b>Fresh</b> <em>food</em>')).toBe('Fresh food');
  });

  it('strips script-like markup without interpreting it', () => {
    expect(toPlainText('<script>alert("x")</script>Safe')).toBe('alert("x")Safe');
  });

  it('preserves Unicode and Devanagari text', () => {
    expect(toPlainText(' स्वादिष्ट खाना — delicious food ')).toBe('स्वादिष्ट खाना — delicious food');
  });

  it('normalizes whitespace and removes control characters', () => {
    expect(toPlainText('  Fresh\tfood\n\u0000today  ')).toBe('Fresh food today');
  });

  it('returns an empty string for empty or markup-only input', () => {
    expect(toPlainText('')).toBe('');
    expect(toPlainText(' <!-- comment --> ')).toBe('');
  });

  it('preserves quotes and special characters as plain text', () => {
    expect(toPlainText(`"Great" & tasty < 5 > 1`)).toBe(`"Great" & tasty < 5 > 1`);
  });
});
