import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config.js';
import { parseSheetMatrix } from '../src/parse.js';
import { prepareRows } from '../src/validation.js';
import { HEADER, dataRow } from './helpers.js';

function prepare(cells: Record<string, string>[]) {
  const parsed = parseSheetMatrix([HEADER, ...cells.map((entry) => dataRow(entry))], DEFAULT_CONFIG);
  if (!parsed.ok) throw new Error(parsed.error);
  return prepareRows(parsed.rows, DEFAULT_CONFIG.timezone, (rowNumber) => `APT-${rowNumber}`);
}

describe('prepareRows', () => {
  it('flags missing and unreadable fields on active rows', () => {
    const rows = prepare([
      { 'Appointment ID': 'APT-1', Date: '2026-04-07', 'Start time': '09:30', 'Duration (minutes)': '60' },
      { 'Appointment ID': 'APT-2', 'Client name': 'Morgan', Date: 'not-a-date', 'Start time': '09:30', 'Duration (minutes)': '60' },
      { 'Appointment ID': 'APT-3', 'Client name': 'Casey', Date: '2026-04-07', 'Duration (minutes)': '60' },
      { 'Appointment ID': 'APT-4', 'Client name': 'Taylor', Date: '2026-04-07', 'Start time': '09:30', 'Duration (minutes)': '0' },
      { 'Appointment ID': 'APT-5', 'Client name': 'Hold', Date: '2026-04-07', 'Start time': '09:30', 'Duration (minutes)': '30', Status: 'hold' },
    ]);
    expect(rows.map((row) => (row.kind === 'invalid' ? row.errors.join(' ') : 'ok'))).toEqual([
      'Client name is required.',
      'Date "not-a-date" is not valid. Use YYYY-MM-DD or DD/MM/YYYY.',
      'Start time is required.',
      'Duration must be greater than 0.',
      'Status "hold" is not recognised. Use scheduled or cancelled.',
    ]);
  });

  it('treats blank, confirmed, and booked as scheduled', () => {
    const rows = prepare([
      { 'Appointment ID': 'APT-1', 'Client name': 'A', Date: '2026-04-07', 'Start time': '09:00', 'Duration (minutes)': '30' },
      { 'Appointment ID': 'APT-2', 'Client name': 'B', Date: '2026-04-07', 'Start time': '10:00', 'Duration (minutes)': '30', Status: 'confirmed' },
      { 'Appointment ID': 'APT-3', 'Client name': 'C', Date: '2026-04-07', 'Start time': '11:00', 'Duration (minutes)': '30', Status: 'booked' },
    ]);
    expect(rows.every((row) => row.kind === 'ready' && row.status === 'scheduled')).toBe(true);
  });

  it('still cancels a row whose other cells are messy', () => {
    const rows = prepare([
      {
        'Appointment ID': 'APT-9',
        'Client name': '',
        Date: 'not-a-date',
        Status: 'cancelled',
        'Calendar event ID': 'evt-9',
      },
    ]);
    expect(rows[0]).toMatchObject({ kind: 'ready', status: 'cancelled', eventId: 'evt-9' });
  });

  it('blocks both rows when an id is duplicated', () => {
    const rows = prepare([
      { 'Appointment ID': 'APT-1', 'Client name': 'A', Date: '2026-04-07', 'Start time': '09:00', 'Duration (minutes)': '30' },
      { 'Appointment ID': 'APT-1', 'Client name': 'B', Date: '2026-04-07', 'Start time': '10:00', 'Duration (minutes)': '30' },
    ]);
    expect(rows.every((row) => row.kind === 'invalid' && row.errors.some((error) => error.includes('more than one row')))).toBe(true);
  });

  it('assigns an id only for active rows that do not have one', () => {
    const rows = prepare([
      { 'Client name': 'Harper', Date: '2026-04-17', 'Start time': '13:30', 'Duration (minutes)': '60' },
      { 'Client name': 'Noah', Status: 'canceled' },
    ]);
    expect(rows[0]).toMatchObject({ kind: 'ready', appointmentId: 'APT-2', generatedId: true });
    expect(rows[1]).toMatchObject({ kind: 'ready', status: 'cancelled', appointmentId: '', generatedId: false });
  });

  it('turns a daylight-saving gap into a row error and does not keep a generated id', () => {
    const rows = prepare([
      { 'Client name': 'Gap', Date: '2026-03-29', 'Start time': '01:30', 'Duration (minutes)': '30' },
    ]);
    expect(rows[0]).toMatchObject({ kind: 'invalid', appointmentId: '' });
    if (rows[0]?.kind !== 'invalid') return;
    expect(rows[0].errors[0]).toMatch(/does not exist in Europe\/London/);
  });
});
