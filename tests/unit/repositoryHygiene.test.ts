import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('repository hygiene', () => {
  it('does not hide source API routes behind the runtime-upload ignore rule', () => {
    const ignore = readFileSync('.gitignore', 'utf8');
    expect(ignore).toContain('/uploads/');
    expect(ignore).toContain('/public/uploads/');
    expect(ignore).not.toMatch(/^uploads\/$/m);
    expect(existsSync('app/api/uploads/route.ts')).toBe(true);
    expect(existsSync('app/api/uploads/[filename]/route.ts')).toBe(true);
  });
});
