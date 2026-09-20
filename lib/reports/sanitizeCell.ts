const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function neutralizeSpreadsheetFormula(value: string) {
  return FORMULA_PREFIX.test(value.trimStart()) ? `'${value}` : value;
}

export function csvField(value: unknown) {
  if (value == null) return '';
  const raw = typeof value === 'string' ? neutralizeSpreadsheetFormula(value) : String(value);
  return `"${raw.replace(/"/g, '""')}"`;
}

export function safeFilenamePart(value: string) {
  const safe = value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return safe || 'report';
}
