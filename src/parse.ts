import { DateTime } from 'luxon';
import { mapHeaders, type ColumnMap, type FieldKey } from './columns.js';
import type { ParsedRow, SyncConfig } from './types.js';
import { dateFromSheetsSerial, fractionToHm, parseDateText, parseTimeText } from './time.js';

export type ParseResult =
  | { ok: true; columns: ColumnMap; rows: ParsedRow[] }
  | { ok: false; error: string };

export function parseSheetMatrix(matrix: unknown[][], config: Pick<SyncConfig, 'headerRow' | 'timezone' | 'maxRows'>): ParseResult {
  const headerIndex = config.headerRow - 1;
  if (headerIndex < 0 || headerIndex >= matrix.length) {
    return { ok: false, error: `Header row ${config.headerRow} is empty. Add a header row before syncing.` };
  }

  const columns = mapHeaders(matrix[headerIndex] ?? []);
  if (columns.missing.length > 0) {
    return {
      ok: false,
      error: `Missing required columns: ${columns.missing.join(', ')}.`,
    };
  }

  const rows: ParsedRow[] = [];
  for (let index = headerIndex + 1; index < matrix.length; index += 1) {
    const cells = matrix[index] ?? [];
    if (isBlankRow(cells)) continue;
    rows.push(parseRow(index + 1, cells, columns, config.timezone));
    if (rows.length > config.maxRows) {
      return {
        ok: false,
        error: `The sheet has more than ${config.maxRows} appointment rows. Raise max rows in Config, or split the sheet.`,
      };
    }
  }
  return { ok: true, columns, rows };
}

function isBlankRow(cells: unknown[]): boolean {
  return cells.every((cell) => textOf(cell) === '' && !(cell instanceof Date));
}

function parseRow(rowNumber: number, cells: unknown[], columns: ColumnMap, timezone: string): ParsedRow {
  const date = readDate(cell(cells, columns, 'date'), timezone);
  const time = readTime(cell(cells, columns, 'startTime'), timezone);
  const duration = readDuration(cell(cells, columns, 'durationMinutes'));
  return {
    rowNumber,
    appointmentId: textOf(cell(cells, columns, 'appointmentId')),
    clientName: textOf(cell(cells, columns, 'clientName')),
    dateText: date.text,
    dateIso: date.iso,
    timeText: time.text,
    timeHm: time.hm,
    durationText: duration.text,
    durationMinutes: duration.minutes,
    location: textOf(cell(cells, columns, 'location')),
    notes: textOf(cell(cells, columns, 'notes')),
    statusText: textOf(cell(cells, columns, 'status')),
    eventId: textOf(cell(cells, columns, 'eventId')),
  };
}

function cell(cells: unknown[], columns: ColumnMap, field: FieldKey): unknown {
  const index = columns.indexes[field];
  if (index === undefined) return '';
  return cells[index];
}

function textOf(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return '';
  return String(value).replace(/\r\n/g, '\n').trim();
}

function readDate(value: unknown, timezone: string): { iso: string | null; text: string } {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return { iso: null, text: 'Invalid Date' };
    const dt = DateTime.fromJSDate(value, { zone: timezone });
    const iso = dt.isValid ? dt.toISODate() : null;
    return { iso, text: iso ?? 'Invalid Date' };
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const iso = dateFromSheetsSerial(value);
    return { iso, text: iso ?? String(value) };
  }
  const text = textOf(value);
  if (!text) return { iso: null, text: '' };
  const iso = parseDateText(text);
  return { iso, text };
}

function readTime(value: unknown, timezone: string): { hm: string | null; text: string } {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return { hm: null, text: 'Invalid Date' };
    const dt = DateTime.fromJSDate(value, { zone: timezone });
    if (!dt.isValid) return { hm: null, text: 'Invalid Date' };
    const hm = dt.toFormat('HH:mm');
    return { hm, text: hm };
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const fraction = value >= 0 && value < 1 ? value : value > 1 && value % 1 !== 0 ? value % 1 : null;
    if (fraction !== null) {
      const hm = fractionToHm(fraction);
      return { hm, text: hm ?? String(value) };
    }
  }
  const text = textOf(value);
  if (!text) return { hm: null, text: '' };
  const hm = parseTimeText(text);
  return { hm, text };
}

function readDuration(value: unknown): { minutes: number | null; text: string } {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (Number.isInteger(value)) return { minutes: value, text: String(value) };
    return { minutes: null, text: String(value) };
  }
  const text = textOf(value);
  if (!text) return { minutes: null, text: '' };
  if (!/^-?\d+$/.test(text)) return { minutes: null, text };
  return { minutes: Number(text), text };
}
