import type { BusinessReport, ReportSection } from '@/lib/analytics/contracts';
import { csvField } from './sanitizeCell';

function displayValue(section: ReportSection, key: string, value: unknown) {
  const column = section.columns.find(entry => entry.key === key);
  if (column?.type === 'money' && typeof value === 'number') return (value / 100).toFixed(2);
  if (column?.type === 'boolean' && typeof value === 'boolean') return value ? 'Yes' : 'No';
  return value;
}

export function generateCsv(report: BusinessReport) {
  const union = new Map<string, string>();
  for (const section of report.sections) {
    for (const column of section.columns) if (!union.has(column.key)) union.set(column.key, column.label);
  }
  const keys = [...union.keys()];
  const metadataHeaders = ['Business title', 'Report type', 'Period', 'Comparison period', 'Filters', 'Generated at (UTC)', 'As of (UTC)', 'Time zone', 'Currency', 'Definitions / limitations', 'Section', 'Row type'];
  const header = [...metadataHeaders, ...keys.map(key => union.get(key) ?? key)];
  const definitions = report.definitions.map(definition => `${definition.id}: ${definition.formula}`).join(' | ');
  const notes = [...report.limitations, definitions].join(' | ');
  const lines = [header.map(csvField).join(',')];

  for (const section of report.sections) {
    const rows = section.rows.length ? section.rows : [{}];
    for (const row of rows) {
      const metadata = [report.title, report.reportType, report.period, report.comparisonPeriod, report.filters.join('; '), report.generatedAt, report.asOfUtc, report.timeZone, `${report.currency} (₹)`, notes, section.title, 'detail'];
      lines.push([...metadata, ...keys.map(key => displayValue(section, key, row[key]))].map(csvField).join(','));
    }
    if (section.totals) {
      const metadata = [report.title, report.reportType, report.period, report.comparisonPeriod, report.filters.join('; '), report.generatedAt, report.asOfUtc, report.timeZone, `${report.currency} (₹)`, notes, section.title, 'total'];
      lines.push([...metadata, ...keys.map(key => displayValue(section, key, section.totals?.[key]))].map(csvField).join(','));
    }
  }
  return Buffer.from(`\uFEFF${lines.join('\r\n')}\r\n`, 'utf8');
}
