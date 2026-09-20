import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import type { BusinessReport, ReportSection } from '@/lib/analytics/contracts';
import { neutralizeSpreadsheetFormula } from './sanitizeCell';

type PdfMakeWithVfs = typeof pdfMake & {
  vfs: Record<string, string>;
  fonts: Record<string, { normal: string; bold: string; italics: string; bolditalics: string }>;
  addVirtualFileSystem: (files: Record<string, string>) => void;
  addFonts: (fonts: Record<string, { normal: string; bold: string; italics: string; bolditalics: string }>) => void;
};

const fontModule = pdfFonts as unknown as { pdfMake?: { vfs?: Record<string, string> }; vfs?: Record<string, string> } & Record<string, string>;
const bundledVfs = fontModule.pdfMake?.vfs ?? fontModule.vfs ?? fontModule;
const devanagariFontFile = 'NotoSansDevanagari_400Regular.ttf';
const devanagariFontPath = join(
  process.cwd(),
  'node_modules',
  '@expo-google-fonts',
  'noto-sans-devanagari',
  '400Regular',
  devanagariFontFile,
);
const DEVANAGARI_TEXT = /[\u0900-\u097f]/;
const pdfMakeWithFonts = pdfMake as PdfMakeWithVfs;
pdfMakeWithFonts.addVirtualFileSystem({
  ...bundledVfs,
  [devanagariFontFile]: readFileSync(devanagariFontPath).toString('base64'),
});
pdfMakeWithFonts.addFonts({
  Roboto: {
    normal: 'Roboto-Regular.ttf',
    bold: 'Roboto-Medium.ttf',
    italics: 'Roboto-Italic.ttf',
    bolditalics: 'Roboto-MediumItalic.ttf',
  },
  NotoDevanagari: {
    normal: devanagariFontFile,
    bold: devanagariFontFile,
    italics: devanagariFontFile,
    bolditalics: devanagariFontFile,
  },
});

function display(section: ReportSection, key: string, value: unknown) {
  const type = section.columns.find(column => column.key === key)?.type;
  if (value == null || value === '') return '—';
  if (type === 'money' && typeof value === 'number') {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value / 100);
  }
  if (type === 'boolean' && typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (type === 'date' && typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return neutralizeSpreadsheetFormula(String(value));
}

function pdfCell(section: ReportSection, key: string, value: unknown) {
  const rendered = display(section, key, value);
  return typeof rendered === 'string' && DEVANAGARI_TEXT.test(rendered)
    ? { text: rendered, font: 'NotoDevanagari' }
    : rendered;
}

function pdfColumnGroups(section: ReportSection) {
  if (section.columns.length <= 10) return [section.columns];
  const anchors = section.columns.slice(0, 2);
  const remaining = section.columns.slice(2);
  const groups: typeof section.columns[] = [];
  for (let index = 0; index < remaining.length; index += 8) {
    groups.push([...anchors, ...remaining.slice(index, index + 8)]);
  }
  return groups;
}

export async function generatePdf(report: BusinessReport) {
  const content: unknown[] = [
    { text: report.title, style: 'title' },
    { text: `Report: ${report.reportType}`, style: 'metadata' },
    { text: `Period: ${report.period}`, style: 'metadata' },
    { text: `Comparison: ${report.comparisonPeriod}`, style: 'metadata' },
    { text: `Filters: ${report.filters.join('; ')}`, style: 'metadata' },
    { text: `Generated: ${report.generatedAt} | As of: ${report.asOfUtc} | Time zone: ${report.timeZone} | Currency: ${report.currency} (₹)`, style: 'metadata' },
    { text: 'व्यवसाय रिपोर्ट · भारतीय रुपया', font: 'NotoDevanagari', style: 'metadata', margin: [0, 0, 0, 8] },
  ];
  for (const section of report.sections) {
    content.push({ text: section.title, style: 'section', pageBreak: content.length > 5 ? 'before' : undefined });
    const columnGroups = pdfColumnGroups(section);
    for (const [groupIndex, columns] of columnGroups.entries()) {
      if (columnGroups.length > 1) content.push({ text: `Columns ${groupIndex + 1} of ${columnGroups.length}`, style: 'note', margin: [0, groupIndex ? 8 : 0, 0, 3] });
      const body: unknown[][] = [columns.map(column => ({ text: column.label, style: 'tableHeader' }))];
      if (section.rows.length === 0) body.push([{ text: 'No rows for the selected filters.', colSpan: Math.max(1, columns.length), italics: true }, ...columns.slice(1).map(() => '')]);
      for (const row of section.rows) body.push(columns.map(column => pdfCell(section, column.key, row[column.key])));
      if (section.totals) body.push(columns.map(column => {
        const cell = pdfCell(section, column.key, section.totals?.[column.key]);
        return { ...(typeof cell === 'object' ? cell as object : { text: cell }), bold: true };
      }));
      content.push({
        table: { headerRows: 1, dontBreakRows: true, widths: columns.map(() => '*'), body },
        layout: 'lightHorizontalLines',
        fontSize: 7,
      });
    }
  }
  content.push({ text: 'Definitions and limitations', style: 'section', pageBreak: 'before' });
  for (const limitation of report.limitations) content.push({ text: `• ${limitation}`, style: 'note' });
  for (const definition of report.definitions) {
    content.push({ text: `${definition.label} (${definition.id})`, bold: true, margin: [0, 5, 0, 1] });
    content.push({ text: `${definition.formula} Timestamp: ${definition.timestampBasis} Refund treatment: ${definition.refundTreatment}`, style: 'note' });
  }

  const definition = {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [28, 34, 28, 34],
    defaultStyle: { font: 'Roboto', fontSize: 8 },
    content,
    styles: {
      title: { fontSize: 20, bold: true, color: '#FF4500', margin: [0, 0, 0, 8] },
      section: { fontSize: 13, bold: true, color: '#222222', margin: [0, 8, 0, 6] },
      metadata: { fontSize: 8, color: '#555555', margin: [0, 1, 0, 1] },
      tableHeader: { bold: true, color: '#FFFFFF', fillColor: '#FF5200', fontSize: 7 },
      note: { fontSize: 7, color: '#555555', margin: [0, 1, 0, 2] },
    },
    footer: (currentPage: number, pageCount: number) => ({
      text: `SHATVIKA CORNER • Page ${currentPage} of ${pageCount}`,
      alignment: 'center', fontSize: 7, color: '#777777', margin: [0, 8, 0, 0],
    }),
  } as TDocumentDefinitions;

  return new Promise<Buffer>((resolve, reject) => {
    try {
      pdfMake.createPdf(definition).getBuffer(buffer => resolve(Buffer.from(buffer)));
    } catch (error) {
      reject(error);
    }
  });
}
