import ExcelJS from 'exceljs';
import type { BusinessReport, ReportCell, ReportSection } from '@/lib/analytics/contracts';
import { neutralizeSpreadsheetFormula } from './sanitizeCell';

function uniqueSheetName(workbook: ExcelJS.Workbook, title: string) {
  const base = title.replace(/[\\/*?:[\]]/g, ' ').trim().slice(0, 31) || 'Report';
  let name = base;
  let suffix = 1;
  while (workbook.getWorksheet(name)) {
    suffix += 1;
    name = `${base.slice(0, 27)} ${suffix}`;
  }
  return name;
}

function typedValue(section: ReportSection, key: string, value: ReportCell | undefined) {
  const type = section.columns.find(column => column.key === key)?.type;
  if (value == null) return '';
  if (type === 'money' && typeof value === 'number') return value / 100;
  if (type === 'date' && typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? neutralizeSpreadsheetFormula(value) : parsed;
  }
  if (typeof value === 'string') return neutralizeSpreadsheetFormula(value);
  return value;
}

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF5200' } };
  row.alignment = { vertical: 'middle', wrapText: true };
  row.height = 30;
}

export async function generateXlsx(report: BusinessReport) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SHATVIKA CORNER';
  workbook.created = new Date(report.generatedAt);
  workbook.modified = new Date(report.generatedAt);
  workbook.properties.date1904 = false;

  const info = workbook.addWorksheet('Report information', { views: [{ state: 'frozen', ySplit: 1 }] });
  info.columns = [{ header: 'Field', key: 'field', width: 28 }, { header: 'Value', key: 'value', width: 110 }];
  styleHeader(info.getRow(1));
  [
    ['Business title', report.title],
    ['Report type', report.reportType],
    ['Period', report.period],
    ['Comparison period', report.comparisonPeriod],
    ['Filters', report.filters.join('; ')],
    ['Generated at (UTC)', report.generatedAt],
    ['As of (UTC)', report.asOfUtc],
    ['Business time zone', report.timeZone],
    ['Currency', `${report.currency} (₹)`],
    ['Hindi report label', 'व्यवसाय रिपोर्ट'],
    ['Limitations', report.limitations.join(' | ') || 'None recorded'],
  ].forEach(([field, value]) => info.addRow({ field, value: neutralizeSpreadsheetFormula(value) }));
  info.addRow({ field: 'Metric definitions', value: '' });
  for (const definition of report.definitions) {
    info.addRow({ field: definition.id, value: `${definition.label}: ${definition.formula} Timestamp: ${definition.timestampBasis} Refunds: ${definition.refundTreatment}` });
  }
  info.eachRow(row => { row.alignment = { vertical: 'top', wrapText: true }; });

  for (const section of report.sections) {
    const worksheet = workbook.addWorksheet(uniqueSheetName(workbook, section.title), {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    worksheet.columns = section.columns.map(column => ({
      header: column.label,
      key: column.key,
      width: Math.min(45, Math.max(14, column.label.length + 3)),
      style: column.type === 'money'
        ? { numFmt: '₹#,##0.00;[Red]-₹#,##0.00' }
        : column.type === 'date' ? { numFmt: 'dd-mmm-yyyy hh:mm' } : column.type === 'text' ? { numFmt: '@' } : {},
    }));
    styleHeader(worksheet.getRow(1));
    if (section.columns.length) worksheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: section.columns.length } };
    for (const data of section.rows) {
      const row: Record<string, unknown> = {};
      for (const column of section.columns) row[column.key] = typedValue(section, column.key, data[column.key]);
      worksheet.addRow(row);
    }
    if (section.totals) {
      const row: Record<string, unknown> = {};
      for (const column of section.columns) row[column.key] = typedValue(section, column.key, section.totals[column.key]);
      const totalRow = worksheet.addRow(row);
      totalRow.font = { bold: true };
      totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE6D7' } };
    }
    worksheet.eachRow(row => { row.alignment = { vertical: 'top', wrapText: true }; });
  }

  const result = await workbook.xlsx.writeBuffer();
  return Buffer.from(result as ArrayBuffer);
}
