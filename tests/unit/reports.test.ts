import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import type { BusinessReport, ReportSection } from '@/lib/analytics/contracts';
import { computeAnalyticsSnapshot, redactSnapshotForDashboard } from '@/lib/analytics/service';
import { buildBusinessReport } from '@/lib/reports/datasets';
import { generateCsv } from '@/lib/reports/csv';
import { generatePdf } from '@/lib/reports/pdf';
import { assertReportSize, generateReport, MAX_PDF_ROWS, MAX_REPORT_ROWS, ReportGenerationError } from '@/lib/reports/service';
import { generateXlsx } from '@/lib/reports/xlsx';
import { analyticsServiceFixture } from '@/tests/fixtures/analytics';
import { csvRecords, parseCsv, parsePdf, parsePdfText } from '@/tests/helpers/reportParsers';

function fixtureReport(reportType: BusinessReport['reportType'] = 'sales-orders') {
  const snapshot = computeAnalyticsSnapshot(analyticsServiceFixture());
  return { snapshot, report: buildBusinessReport(snapshot, reportType) };
}

function section(report: BusinessReport, key: string): ReportSection {
  const result = report.sections.find(candidate => candidate.key === key);
  if (!result) throw new Error(`Missing report section: ${key}`);
  return result;
}

function workbookSheet(workbook: ExcelJS.Workbook, name: string) {
  const result = workbook.getWorksheet(name);
  if (!result) throw new Error(`Missing workbook sheet: ${name}`);
  return result;
}

function columnNumbers(worksheet: ExcelJS.Worksheet) {
  const columns = new Map<string, number>();
  worksheet.getRow(1).eachCell((cell, columnNumber) => columns.set(String(cell.value), columnNumber));
  return columns;
}

function requiredColumn(columns: Map<string, number>, label: string) {
  const result = columns.get(label);
  if (!result) throw new Error(`Missing workbook column: ${label}`);
  return result;
}

function withHostileCells(report: BusinessReport) {
  const copy = structuredClone(report);
  const firstOrder = section(copy, 'orders').rows[0];
  firstOrder.orderId = '=HYPERLINK("https://example.test", "open")';
  firstOrder.couponCode = 'SAVE,"5"\r\nsecond line';
  return copy;
}

describe('business report dataset reconciliation', () => {
  it('carries the dashboard snapshot, filters, and metric values into the export dataset', () => {
    const { snapshot, report } = fixtureReport();
    const dashboard = redactSnapshotForDashboard(snapshot);
    const overviewRows = new Map(section(report, 'overview').rows.map(row => [row.definition, row]));

    expect(report.generatedAt).toBe(dashboard.meta.asOfUtc);
    expect(report.asOfUtc).toBe(dashboard.meta.asOfUtc);
    expect(report.timeZone).toBe(dashboard.meta.timeZone);
    expect(report.currency).toBe('INR');
    expect(report.period).toBe(dashboard.meta.range.label);
    expect(report.comparisonPeriod).toContain(dashboard.meta.comparisonRange.fromUtc);
    expect(report.filters).toEqual([
      'Statuses: all',
      'Payment methods: all',
      'Payment statuses: all',
    ]);

    for (const metric of Object.values(dashboard.overview)) {
      const exported = overviewRows.get(metric.definitionId);
      expect(exported, `missing ${metric.definitionId}`).toBeDefined();
      expect(exported?.value).toBe(metric.value ?? 'Not available');
      expect(exported?.previous).toBe(metric.previous ?? 'Not available');
      expect(exported?.unit).toBe(metric.unit);
      expect(exported?.coverage).toBe(metric.coveragePct ?? '');
    }
  });

  it('exports every filtered order and reconciles its totals from integer paise', () => {
    const { snapshot, report } = fixtureReport();
    const orders = section(report, 'orders');

    expect(orders.rows).toHaveLength(snapshot.tables.orders.length);
    expect(report.rowCount).toBe(report.sections.reduce((total, current) => total + current.rows.length, 0));
    expect(orders.totals).toMatchObject({
      orderId: 'TOTAL',
      itemCount: snapshot.tables.orders.reduce((total, row) => total + row.itemCount, 0),
      subtotalPaise: snapshot.tables.orders.reduce((total, row) => total + row.subtotalPaise, 0),
      discountPaise: snapshot.tables.orders.reduce((total, row) => total + row.discountPaise, 0),
      taxPaise: snapshot.tables.orders.reduce((total, row) => total + row.taxPaise, 0),
      deliveryPaise: snapshot.tables.orders.reduce((total, row) => total + row.deliveryPaise, 0),
      totalPaise: snapshot.tables.orders.reduce((total, row) => total + row.totalPaise, 0),
      collectedPaise: snapshot.tables.orders.reduce((total, row) => total + (row.collectedPaise ?? 0), 0),
      refundedPaise: snapshot.tables.orders.reduce((total, row) => total + (row.refundedPaise ?? 0), 0),
    });
  });

  it('keeps customer contact data out unless the deliberate PII mode is enabled', () => {
    const { snapshot } = fixtureReport();
    const minimized = section(buildBusinessReport(snapshot, 'customers'), 'customers');
    const detailed = section(buildBusinessReport(snapshot, 'customers', true), 'customers');

    expect(minimized.columns.map(column => column.key)).not.toContain('email');
    expect(minimized.columns.map(column => column.key)).not.toContain('phone');
    expect(JSON.stringify(minimized.rows)).not.toContain('alice@example.test');
    expect(detailed.columns.map(column => column.key)).toEqual(expect.arrayContaining(['customerName', 'email', 'phone']));
    expect(detailed.rows.some(row => row.email === 'alice@example.test')).toBe(true);
  });

  it('reconciles detailed sold-item and consolidated counter-business sections', () => {
    const { snapshot } = fixtureReport();
    const soldItems = section(buildBusinessReport(snapshot, 'sold-items'), 'sold-items');
    const consolidated = buildBusinessReport(snapshot, 'consolidated');

    expect(soldItems.rows).toHaveLength(snapshot.tables.soldItems.length);
    expect(soldItems.totals).toMatchObject({
      quantity: snapshot.tables.soldItems.reduce((sum, row) => sum + row.quantity, 0),
      netSalesPaise: snapshot.tables.soldItems.reduce((sum, row) => sum + row.netSalesPaise, 0),
      refundAdjustmentPaise: snapshot.tables.soldItems.reduce((sum, row) => sum + row.refundAdjustmentPaise, 0),
    });
    expect(consolidated.sections.map(current => current.key)).toEqual(expect.arrayContaining([
      'overview', 'orders', 'sold-items', 'products', 'categories', 'expenses', 'payments-refunds', 'inventory', 'inventory-events', 'operations', 'customers',
    ]));
  });

  it('keeps the dashboard cutoff distinct from the report generation timestamp', () => {
    const snapshot = computeAnalyticsSnapshot(analyticsServiceFixture());
    const generatedAt = '2026-09-10T06:31:00.000Z';
    const report = buildBusinessReport(snapshot, 'business-summary', false, generatedAt);
    expect(report.asOfUtc).toBe(snapshot.meta.asOfUtc);
    expect(report.generatedAt).toBe(generatedAt);
  });
});

describe('CSV report generation', () => {
  it('round-trips metadata, escaped fields, formula protection, money, and totals', () => {
    const { report: baseReport } = fixtureReport();
    const report = withHostileCells(baseReport);
    const buffer = generateCsv(report);
    const rows = parseCsv(buffer);
    const records = csvRecords(buffer);
    const totalSections = report.sections.filter(current => current.totals).length;

    expect(buffer.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
    expect(buffer.toString('utf8')).toMatch(/\r\n$/);
    expect(new Set(rows[0]).size).toBe(rows[0].length);
    expect(records).toHaveLength(report.rowCount + totalSections);

    const overview = records.find(row => row.Section === 'Business overview' && row['Definition ID'] === 'merchandise_sales');
    expect(overview).toMatchObject({
      'Generated at (UTC)': report.generatedAt,
      'As of (UTC)': report.asOfUtc,
      'Time zone': 'Asia/Kolkata',
      Value: '28000',
      Unit: 'paise',
      Currency: 'INR (₹)',
      'Comparison period': report.comparisonPeriod,
    });

    const detail = records.find(row => row.Section === 'Filtered orders' && row['Order ID'].startsWith("'="));
    expect(detail?.['Order ID']).toBe("'=HYPERLINK(\"https://example.test\", \"open\")");
    expect(detail?.Coupon).toBe('SAVE,"5"\r\nsecond line');
    expect(detail?.['Invoice total (INR)']).toMatch(/^\d+\.\d{2}$/);

    const total = records.find(row => row.Section === 'Filtered orders' && row['Row type'] === 'total');
    expect(total).toMatchObject({
      'Order ID': 'TOTAL',
      'Merchandise subtotal (INR)': '420.00',
      'Invoice total (INR)': '470.50',
      'Collected (INR)': '303.50',
      'Refunded (INR)': '104.00',
    });
  });
});

describe('XLSX report generation', () => {
  it('reopens as a typed workbook with deterministic metadata and protected text cells', async () => {
    const { report: baseReport } = fixtureReport();
    const report = withHostileCells(baseReport);
    const buffer = await generateXlsx(report);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);

    expect(workbook.creator).toBe('SHATVIKA CORNER');
    expect(workbook.created?.toISOString()).toBe(report.generatedAt);
    expect(workbook.modified?.toISOString()).toBe(report.generatedAt);
    expect(workbook.worksheets.map(worksheet => worksheet.name)).toEqual([
      'Report information',
      'Business overview',
      'Filtered orders',
    ]);

    const information = workbookSheet(workbook, 'Report information');
    const informationRows = new Map<string, unknown>();
    information.eachRow((row, rowNumber) => {
      if (rowNumber > 1) informationRows.set(String(row.getCell(1).value), row.getCell(2).value);
    });
    expect(informationRows.get('Generated at (UTC)')).toBe(report.generatedAt);
    expect(informationRows.get('As of (UTC)')).toBe(report.asOfUtc);
    expect(informationRows.get('Business time zone')).toBe(report.timeZone);
    expect(informationRows.get('Comparison period')).toBe(report.comparisonPeriod);
    expect(informationRows.get('Currency')).toBe('INR (₹)');
    expect(informationRows.get('Hindi report label')).toBe('व्यवसाय रिपोर्ट');

    const orders = workbookSheet(workbook, 'Filtered orders');
    const columns = columnNumbers(orders);
    const sourceOrders = section(report, 'orders');
    const firstRow = orders.getRow(2);
    const totalRow = orders.getRow(orders.rowCount);
    const orderIdColumn = requiredColumn(columns, 'Order ID');
    const placedAtColumn = requiredColumn(columns, 'Placed at (UTC)');
    const totalColumn = requiredColumn(columns, 'Invoice total (INR)');

    expect(orders.rowCount).toBe(sourceOrders.rows.length + 2);
    expect(firstRow.getCell(orderIdColumn).type).toBe(ExcelJS.ValueType.String);
    expect(firstRow.getCell(orderIdColumn).value).toBe("'=HYPERLINK(\"https://example.test\", \"open\")");
    expect(firstRow.getCell(placedAtColumn).value).toBeInstanceOf(Date);
    expect((firstRow.getCell(placedAtColumn).value as Date).toISOString()).toBe(sourceOrders.rows[0].placedAt);
    expect(firstRow.getCell(totalColumn).value).toBe(Number(sourceOrders.rows[0].totalPaise) / 100);
    expect(firstRow.getCell(totalColumn).numFmt).toBe('₹#,##0.00;[Red]-₹#,##0.00');
    expect(totalRow.getCell(orderIdColumn).value).toBe('TOTAL');
    expect(totalRow.getCell(totalColumn).value).toBe(470.5);
    expect(totalRow.font.bold).toBe(true);
  });
});

describe('PDF report generation', () => {
  it('parses through a valid xref/page tree and exposes expected report text', async () => {
    const { report } = fixtureReport();
    const buffer = await generatePdf(report);
    const parsed = parsePdf(buffer);
    const independentlyParsed = await parsePdfText(buffer);
    const text = independentlyParsed.pages.join('\n').replace(/\s+/g, ' ');

    expect(parsed.version).toBe('1.3');
    expect(parsed.pageCount).toBeGreaterThanOrEqual(2);
    expect(independentlyParsed.pageCount).toBe(parsed.pageCount);
    expect(parsed.objectCount).toBeGreaterThan(parsed.pageCount);
    expect(parsed.startXref).toBeGreaterThan(0);
    expect(text).toContain(report.title);
    expect(text).toContain('Report: sales-orders');
    expect(text).toContain('Business overview');
    expect(text).toContain('Filtered orders');
    expect(text).toContain(report.asOfUtc);
    expect(text).toContain('Definitions and limitations');
    expect(text).toContain('INR (₹)');
    // Complex-script glyph shaping may be extracted as separate clusters by PDF readers;
    // these assertions verify that the embedded font preserves Devanagari and the text is not null-glyph output.
    expect(text).toContain('भारतीय');
    expect(text).toMatch(/व्य\s+वसाय/);
    expect(text).not.toContain('\u0000');
  });
});

describe('report service limits and response metadata', () => {
  it('enforces the format-specific row limits at their exact boundary', () => {
    const { report } = fixtureReport();
    expect(() => assertReportSize({ ...report, rowCount: MAX_PDF_ROWS }, 'pdf')).not.toThrow();
    expect(() => assertReportSize({ ...report, rowCount: MAX_REPORT_ROWS }, 'csv')).not.toThrow();

    for (const [format, rowCount] of [['pdf', MAX_PDF_ROWS + 1], ['xlsx', MAX_REPORT_ROWS + 1]] as const) {
      try {
        assertReportSize({ ...report, rowCount }, format);
        throw new Error('Expected the report limit to reject the export');
      } catch (error) {
        expect(error).toBeInstanceOf(ReportGenerationError);
        expect((error as ReportGenerationError).code).toBe('REPORT_TOO_LARGE');
      }
    }
  });

  it('returns stable download metadata derived from the report snapshot', async () => {
    const { report } = fixtureReport();
    const generated = await generateReport(report, 'csv');

    expect(generated.contentType).toBe('text/csv; charset=utf-8');
    expect(generated.filename).toBe('sales-orders-2026-09-10.csv');
    expect(generated.buffer.equals(generateCsv(report))).toBe(true);
  });
});
