/// <reference types="google-apps-script" />

import { FIELD_LABELS, mapHeaders, type FieldKey } from '../columns.js';
import { syncResultColor } from '../report.js';
import type { RowOutcome } from '../types.js';

type Sheet = GoogleAppsScript.Spreadsheet.Sheet;
type Spreadsheet = GoogleAppsScript.Spreadsheet.Spreadsheet;

/**
 * Read from row 1, not from getDataRange(). getDataRange drops leading
 * blank rows, which would make "header row 2" point at the wrong cells.
 */
export function readSheetMatrix(spreadsheet: Spreadsheet, sheetName: string): unknown[][] {
  const sheet = requireSheet(spreadsheet, sheetName);
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow === 0 || lastColumn === 0) return [];
  return sheet.getRange(1, 1, lastRow, lastColumn).getValues() as unknown[][];
}

export function readOptionalMatrix(spreadsheet: Spreadsheet, sheetName: string): unknown[][] {
  const sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow === 0 || lastColumn === 0) return [];
  return sheet.getRange(1, 1, lastRow, lastColumn).getValues() as unknown[][];
}

export function writeAppointmentIdCells(
  spreadsheet: Spreadsheet,
  sheetName: string,
  headerRow: number,
  updates: { rowNumber: number; appointmentId: string }[],
): void {
  if (updates.length === 0) return;
  const sheet = requireSheet(spreadsheet, sheetName);
  const column = columnIndex(sheet, headerRow, 'appointmentId');
  const writes = new Map(updates.map((update) => [update.rowNumber, update.appointmentId]));
  writeColumn(sheet, column, writes);
}

export function writeOutcomeCells(
  spreadsheet: Spreadsheet,
  sheetName: string,
  headerRow: number,
  outcomes: RowOutcome[],
): void {
  if (outcomes.length === 0) return;
  const sheet = requireSheet(spreadsheet, sheetName);
  const eventColumn = columnIndex(sheet, headerRow, 'eventId');
  const resultColumn = columnIndex(sheet, headerRow, 'syncResult');
  const eventWrites = new Map<number, string>();
  const resultWrites = new Map<number, string>();
  const colors = new Map<number, string>();
  for (const outcome of outcomes) {
    if (outcome.eventId !== undefined) eventWrites.set(outcome.rowNumber, outcome.eventId ?? '');
    resultWrites.set(outcome.rowNumber, outcome.syncResult);
    colors.set(outcome.rowNumber, syncResultColor(outcome.syncResult));
  }
  writeColumn(sheet, eventColumn, eventWrites);
  writeColumn(sheet, resultColumn, resultWrites, colors);
}

function requireSheet(spreadsheet: Spreadsheet, sheetName: string): Sheet {
  const sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) throw new Error(`Sheet "${sheetName}" was not found.`);
  return sheet;
}

function columnIndex(sheet: Sheet, headerRow: number, field: FieldKey): number {
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(headerRow, 1, 1, lastColumn).getValues()[0] ?? [];
  const index = mapHeaders(headers).indexes[field];
  if (index === undefined) throw new Error(`Column "${FIELD_LABELS[field]}" is missing on row ${headerRow}.`);
  return index;
}

function writeColumn(sheet: Sheet, columnIndexZero: number, writes: Map<number, string>, colors?: Map<number, string>): void {
  if (writes.size === 0) return;
  const rows = [...writes.keys()];
  const start = Math.min(...rows);
  const end = Math.max(...rows);
  const range = sheet.getRange(start, columnIndexZero + 1, end - start + 1, 1);
  const values = range.getValues();
  const fontColors = colors ? range.getFontColors() : null;
  for (const [rowNumber, value] of writes) {
    const offset = rowNumber - start;
    const line = values[offset];
    if (!line) continue;
    line[0] = value;
    if (fontColors && colors) {
      const colorLine = fontColors[offset];
      const color = colors.get(rowNumber);
      if (colorLine && color) colorLine[0] = color;
    }
  }
  range.setValues(values);
  if (fontColors) range.setFontColors(fontColors);
}
