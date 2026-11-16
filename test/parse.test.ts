import { describe, expect, it } from 'vitest';
import { mapHeaders } from '../src/columns.js';
import { DEFAULT_CONFIG } from '../src/config.js';
import { parseSheetMatrix } from '../src/parse.js';
import { HEADER, dataRow } from './helpers.js';

const config = { ...DEFAULT_CONFIG, maxRows: 50 };

describe('headers', () => {
  it('recognises aliases and does not confuse status with sync status', () => {
    const mapped = mapHeaders(['client', 'appointment_date', 'start', 'duration_minutes', 'sync status', 'status', 'event id', 'appointment id']);
    expect(mapped.indexes.clientName).toBe(0);
    expect(mapped.indexes.date).toBe(1);
    expect(mapped.indexes.startTime).toBe(2);
    expect(mapped.indexes.durationMinutes).toBe(3);
    expect(mapped.indexes.syncResult).toBe(4);
    expect(mapped.indexes.status).toBe(5);
    expect(mapped.indexes.eventId).toBe(6);
    expect(mapped.missing).toEqual([]);
  });

  it('names the columns that still need to be added', () => {
    expect(mapHeaders(['Client name']).missing).toContain('Sync result');
  });
});

describe('parseSheetMatrix', () => {
  it('skips blank rows and coerces Sheets dates, times, and durations', () => {
    const date = new Date('2026-04-06T23:00:00.000Z');
    const time = new Date('2026-04-07T08:30:00.000Z');
    const matrix = [
      HEADER,
      dataRow({}),
      [
        'APT-1',
        'Avery Quinn',
        date,
        time,
        60,
        'Studio',
        'Bring samples',
        'scheduled',
        '',
        '',
      ],
    ];
    const parsed = parseSheetMatrix(matrix, config);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toMatchObject({
      rowNumber: 3,
      dateIso: '2026-04-07',
      timeHm: '09:30',
      durationMinutes: 60,
      clientName: 'Avery Quinn',
    });
  });

  it('reads a day-fraction time and a title row above the header', () => {
    const jamie: unknown[] = dataRow({
      'Appointment ID': 'APT-9',
      'Client name': 'Jamie Patel',
      Date: '08/04/2026',
      'Start time': '09:30',
      'Duration (minutes)': '45',
      Status: 'booked',
    });
    jamie[HEADER.indexOf('Start time')] = 9.5 / 24;
    const matrix = [['Spring appointments'], HEADER, jamie];
    const parsed = parseSheetMatrix(matrix, { ...config, headerRow: 2 });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.rows[0]).toMatchObject({
      rowNumber: 3,
      dateIso: '2026-04-08',
      timeHm: '09:30',
      durationMinutes: 45,
    });
  });

  it('stops when the sheet is larger than max rows', () => {
    const matrix = [HEADER, dataRow({ 'Client name': 'A' }), dataRow({ 'Client name': 'B' })];
    const parsed = parseSheetMatrix(matrix, { ...config, maxRows: 1 });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error).toMatch(/more than 1/);
  });

  it('reports a missing header row', () => {
    const parsed = parseSheetMatrix([['notes']], config);
    expect(parsed.ok).toBe(false);
  });
});
