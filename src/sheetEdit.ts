import { mapHeaders } from './columns.js';
import type { RowOutcome } from './types.js';

export interface IdUpdate {
  rowNumber: number;
  appointmentId: string;
}

/**
 * In-memory sheet edits. The Apps Script adapter writes the same cells
 * through SpreadsheetApp; tests and the local demo use this directly.
 * Row numbers are sheet rows, and `matrix[0]` is sheet row 1.
 */
export function applyAppointmentIds(matrix: unknown[][], headerRow: number, updates: IdUpdate[]): void {
  if (updates.length === 0) return;
  const column = requireColumn(matrix, headerRow, 'appointmentId');
  for (const update of updates) {
    const row = matrix[update.rowNumber - 1];
    if (!row) throw new Error(`Row ${update.rowNumber} is outside the sheet.`);
    row[column] = update.appointmentId;
  }
}

export function applyOutcomes(matrix: unknown[][], headerRow: number, outcomes: RowOutcome[]): void {
  if (outcomes.length === 0) return;
  const eventColumn = requireColumn(matrix, headerRow, 'eventId');
  const resultColumn = requireColumn(matrix, headerRow, 'syncResult');
  for (const outcome of outcomes) {
    const row = matrix[outcome.rowNumber - 1];
    if (!row) throw new Error(`Row ${outcome.rowNumber} is outside the sheet.`);
    if (outcome.eventId !== undefined) row[eventColumn] = outcome.eventId ?? '';
    row[resultColumn] = outcome.syncResult;
  }
}

function requireColumn(
  matrix: unknown[][],
  headerRow: number,
  field: 'appointmentId' | 'eventId' | 'syncResult',
): number {
  const mapped = mapHeaders(matrix[headerRow - 1] ?? []);
  const index = mapped.indexes[field];
  if (index === undefined) {
    throw new Error(`Column for ${field} is missing.`);
  }
  return index;
}
