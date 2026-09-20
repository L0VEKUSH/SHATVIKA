import { inflateSync } from 'node:zlib';

/**
 * Small independent CSV reader used by export tests. It intentionally supports
 * quoted commas, doubled quotes and embedded CR/LF so the tests exercise the
 * bytes a spreadsheet receives rather than duplicating the report writer.
 */
export function parseCsv(buffer: Buffer): string[][] {
  const source = buffer.toString('utf8').replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\r' || character === '\n') {
      if (character === '\r' && source[index + 1] === '\n') index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error('CSV_UNTERMINATED_QUOTED_FIELD');
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function csvRecords(buffer: Buffer): Array<Record<string, string>> {
  const [header, ...rows] = parseCsv(buffer);
  if (!header) return [];
  return rows.map(row => Object.fromEntries(header.map((key, index) => [key, row[index] ?? ''])));
}

type PdfObject = {
  body: Buffer;
  text: string;
};

export type ParsedPdf = {
  version: string;
  pageCount: number;
  pages: string[];
  objectCount: number;
  startXref: number;
};

/** Reopens a generated PDF with an independent standards-based parser. */
export async function parsePdfText(buffer: Buffer): Promise<{ pageCount: number; pages: string[] }> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = getDocument({ data: Uint8Array.from(buffer), useSystemFonts: true });
  const document = await loadingTask.promise;
  try {
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(content.items.map(item => ('str' in item ? item.str : '')).join(' '));
    }
    return { pageCount: document.numPages, pages };
  } finally {
    await loadingTask.destroy();
  }
}

function utf16Be(hex: string) {
  const bytes = Buffer.from(hex.replace(/\s+/g, ''), 'hex');
  if (bytes.length % 2 !== 0) throw new Error('PDF_INVALID_UTF16_HEX');
  bytes.swap16();
  return bytes.toString('utf16le');
}

function objectStream(object: PdfObject) {
  const streamMarker = /stream\r?\n/.exec(object.text);
  if (!streamMarker?.index && streamMarker?.index !== 0) throw new Error('PDF_STREAM_NOT_FOUND');
  const declaredLength = /\/Length\s+(\d+)/.exec(object.text);
  if (!declaredLength) throw new Error('PDF_STREAM_LENGTH_NOT_FOUND');
  const start = streamMarker.index + streamMarker[0].length;
  const bytes = object.body.subarray(start, start + Number(declaredLength[1]));
  return /\/FlateDecode\b/.test(object.text) ? inflateSync(bytes) : bytes;
}

function parseCmap(source: string) {
  const mapping = new Map<number, string>();
  const bfcharBlocks = source.match(/beginbfchar[\s\S]*?endbfchar/g) ?? [];
  for (const block of bfcharBlocks) {
    for (const match of block.matchAll(/<([0-9a-f]+)>\s*<([0-9a-f\s]+)>/gi)) {
      mapping.set(Number.parseInt(match[1], 16), utf16Be(match[2]));
    }
  }

  const bfrangeBlocks = source.match(/beginbfrange[\s\S]*?endbfrange/g) ?? [];
  for (const block of bfrangeBlocks) {
    for (const match of block.matchAll(/<([0-9a-f]+)>\s*<([0-9a-f]+)>\s*\[([^\]]+)]/gi)) {
      const start = Number.parseInt(match[1], 16);
      const end = Number.parseInt(match[2], 16);
      const values = [...match[3].matchAll(/<([0-9a-f\s]+)>/gi)].map(value => utf16Be(value[1]));
      if (values.length !== end - start + 1) throw new Error('PDF_CMAP_RANGE_LENGTH_MISMATCH');
      values.forEach((value, index) => mapping.set(start + index, value));
    }
    for (const match of block.matchAll(/<([0-9a-f]+)>\s*<([0-9a-f]+)>\s*<([0-9a-f]+)>/gi)) {
      const start = Number.parseInt(match[1], 16);
      const end = Number.parseInt(match[2], 16);
      const target = Number.parseInt(match[3], 16);
      for (let code = start; code <= end; code += 1) {
        mapping.set(code, String.fromCodePoint(target + code - start));
      }
    }
  }
  return mapping;
}

function decodePageText(
  source: string,
  fonts: Map<string, Map<number, string>>,
) {
  let activeFont: Map<number, string> | undefined;
  let result = '';
  const tokens = /\/([A-Za-z0-9]+)\s+[-+]?\d+(?:\.\d+)?\s+Tf|<([0-9a-f]+)>|\bET\b/g;
  for (const token of source.matchAll(tokens)) {
    if (token[1]) {
      activeFont = fonts.get(token[1]);
    } else if (token[2] && activeFont) {
      for (let index = 0; index < token[2].length; index += 4) {
        const code = Number.parseInt(token[2].slice(index, index + 4), 16);
        result += activeFont.get(code) ?? '\uFFFD';
      }
    } else {
      result += '\n';
    }
  }
  return result;
}

/**
 * Parses the classic xref table, page tree, font CMaps and compressed content
 * streams produced by pdfmake. Every in-use xref offset is validated before
 * text is decoded, so a truncated or internally corrupt PDF fails the test.
 */
export function parsePdf(buffer: Buffer): ParsedPdf {
  const source = buffer.toString('latin1');
  const version = /^%PDF-(\d+\.\d+)\r?\n/.exec(source)?.[1];
  if (!version) throw new Error('PDF_HEADER_NOT_FOUND');
  const startMatch = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(source);
  if (!startMatch) throw new Error('PDF_TRAILER_NOT_FOUND');
  const startXref = Number(startMatch[1]);
  if (!source.startsWith('xref', startXref)) throw new Error('PDF_XREF_OFFSET_MISMATCH');

  const xref = /^xref\r?\n0\s+(\d+)\r?\n/.exec(source.slice(startXref));
  if (!xref) throw new Error('PDF_XREF_TABLE_NOT_FOUND');
  const declaredObjectCount = Number(xref[1]);
  let cursor = startXref + xref[0].length;
  const offsets = new Map<number, number>();
  for (let objectId = 0; objectId < declaredObjectCount; objectId += 1) {
    const lineEnd = source.indexOf('\n', cursor);
    if (lineEnd < 0) throw new Error('PDF_XREF_TRUNCATED');
    const record = /^(\d{10})\s+\d{5}\s+([fn])\s*$/.exec(source.slice(cursor, lineEnd).replace(/\r$/, ''));
    if (!record) throw new Error('PDF_XREF_RECORD_INVALID');
    if (record[2] === 'n') offsets.set(objectId, Number(record[1]));
    cursor = lineEnd + 1;
  }

  const physicalObjects = [...offsets.entries()].sort((left, right) => left[1] - right[1]);
  const objects = new Map<number, PdfObject>();
  physicalObjects.forEach(([objectId, offset], index) => {
    const header = `${objectId} 0 obj`;
    if (!source.startsWith(header, offset)) throw new Error(`PDF_OBJECT_OFFSET_MISMATCH_${objectId}`);
    const nextOffset = physicalObjects[index + 1]?.[1] ?? startXref;
    const objectBytes = buffer.subarray(offset + header.length, nextOffset);
    const objectText = objectBytes.toString('latin1');
    const end = objectText.lastIndexOf('endobj');
    if (end < 0) throw new Error(`PDF_OBJECT_NOT_TERMINATED_${objectId}`);
    const body = objectBytes.subarray(0, end);
    objects.set(objectId, { body, text: body.toString('latin1') });
  });

  const pagesEntry = [...objects.entries()].find(([, object]) => /\/Type\s+\/Pages\b/.test(object.text));
  if (!pagesEntry) throw new Error('PDF_PAGE_TREE_NOT_FOUND');
  const pageCount = Number(/\/Count\s+(\d+)/.exec(pagesEntry[1].text)?.[1] ?? Number.NaN);
  const kids = /\/Kids\s*\[([^\]]+)]/.exec(pagesEntry[1].text)?.[1]
    .match(/\d+\s+0\s+R/g)
    ?.map(reference => Number.parseInt(reference, 10)) ?? [];
  if (!Number.isInteger(pageCount) || pageCount !== kids.length) throw new Error('PDF_PAGE_COUNT_MISMATCH');

  const fontCmaps = new Map<number, Map<number, string>>();
  for (const [objectId, object] of objects) {
    if (!/\/Subtype\s+\/Type0\b/.test(object.text)) continue;
    const cmapId = Number(/\/ToUnicode\s+(\d+)\s+0\s+R/.exec(object.text)?.[1]);
    const cmapObject = objects.get(cmapId);
    if (!cmapObject) throw new Error(`PDF_CMAP_NOT_FOUND_${objectId}`);
    fontCmaps.set(objectId, parseCmap(objectStream(cmapObject).toString('latin1')));
  }

  const pages = kids.map(pageId => {
    const page = objects.get(pageId);
    if (!page || !/\/Type\s+\/Page\b/.test(page.text)) throw new Error(`PDF_PAGE_NOT_FOUND_${pageId}`);
    const resourcesId = Number(/\/Resources\s+(\d+)\s+0\s+R/.exec(page.text)?.[1]);
    const resources = objects.get(resourcesId);
    if (!resources) throw new Error(`PDF_RESOURCES_NOT_FOUND_${pageId}`);
    const fonts = new Map<string, Map<number, string>>();
    const fontDictionary = /\/Font\s*<<([\s\S]*?)>>/.exec(resources.text)?.[1] ?? '';
    for (const match of fontDictionary.matchAll(/\/([A-Za-z0-9]+)\s+(\d+)\s+0\s+R/g)) {
      const cmap = fontCmaps.get(Number(match[2]));
      if (cmap) fonts.set(match[1], cmap);
    }

    const contentIds = /\/Contents\s+(?:\[([^\]]+)]|(\d+)\s+0\s+R)/.exec(page.text);
    const ids = contentIds?.[2]
      ? [Number(contentIds[2])]
      : [...(contentIds?.[1] ?? '').matchAll(/(\d+)\s+0\s+R/g)].map(match => Number(match[1]));
    if (!ids.length) throw new Error(`PDF_CONTENT_NOT_FOUND_${pageId}`);
    return ids.map(contentId => {
      const content = objects.get(contentId);
      if (!content) throw new Error(`PDF_CONTENT_OBJECT_NOT_FOUND_${contentId}`);
      return decodePageText(objectStream(content).toString('latin1'), fonts);
    }).join('\n');
  });

  return { version, pageCount, pages, objectCount: offsets.size, startXref };
}
