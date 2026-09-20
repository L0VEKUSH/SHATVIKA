import type { BusinessReport, ReportFormat } from '@/lib/analytics/contracts';
import { generateCsv } from './csv';
import { generatePdf } from './pdf';
import { generateXlsx } from './xlsx';
import { safeFilenamePart } from './sanitizeCell';

export const MAX_REPORT_ROWS = 10_000;
export const MAX_PDF_ROWS = 1_500;

export function assertReportSize(report: BusinessReport, format: ReportFormat) {
  const limit = format === 'pdf' ? MAX_PDF_ROWS : MAX_REPORT_ROWS;
  if (report.rowCount > limit) throw new ReportGenerationError('REPORT_TOO_LARGE', `This ${format.toUpperCase()} export has ${report.rowCount} rows; the limit is ${limit}. Narrow the filters.`);
}

export async function generateReport(report: BusinessReport, format: ReportFormat) {
  assertReportSize(report, format);
  const buffer = format === 'csv'
    ? generateCsv(report)
    : format === 'xlsx'
      ? await generateXlsx(report)
      : await generatePdf(report);
  const contentType = format === 'csv'
    ? 'text/csv; charset=utf-8'
    : format === 'xlsx'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'application/pdf';
  const date = report.asOfUtc.slice(0, 10);
  return {
    buffer,
    contentType,
    filename: `${safeFilenamePart(report.reportType)}-${date}.${format}`,
  };
}

export class ReportGenerationError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}
