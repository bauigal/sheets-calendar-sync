import { describe, expect, it } from 'vitest';
import { parseCsv } from '../src/csv.js';
import { HANDLERS } from '../src/gas/entry.js';
import { makeAppointmentId } from '../src/ids.js';
import { syncResultColor } from '../src/report.js';
import { SYNC_HANDLER, triggerIdsForHandlers } from '../src/triggers.js';

describe('csv', () => {
  it('keeps commas and quotes inside quoted cells', () => {
    const rows = parseCsv('name,notes\nQuinn,"She said ""hello"", then left"\n');
    expect(rows).toEqual([
      ['name', 'notes'],
      ['Quinn', 'She said "hello", then left'],
    ]);
  });

  it('rejects an unterminated quote', () => {
    expect(() => parseCsv('"open')).toThrow(/unterminated/);
  });
});

describe('triggers', () => {
  it('selects only this project\'s sync handler', () => {
    const ids = triggerIdsForHandlers(
      [
        { id: 'a', handlerFunction: SYNC_HANDLER },
        { id: 'b', handlerFunction: 'someoneElsesTrigger' },
        { id: 'c', handlerFunction: 'syncNow' },
      ],
      [SYNC_HANDLER],
    );
    expect(ids).toEqual(['a', 'c']);
  });
});

describe('ids and colours', () => {
  it('builds an appointment id the calendar query can store', () => {
    expect(makeAppointmentId(4, 1_700_000_000_000, 'abc-XYZ!')).toMatch(/^APT-4-[a-z0-9]+$/);
  });

  it('colours errors differently from successful writes', () => {
    expect(syncResultColor('Error: Date is required.')).toBe('#9b2c2c');
    expect(syncResultColor('Failed: quota')).toBe('#9b2c2c');
    expect(syncResultColor('Created')).toBe('#176b45');
    expect(syncResultColor('Unchanged')).toBe('#4a5568');
  });
});

describe('menu handlers', () => {
  it('publishes the functions the sheet menu calls', () => {
    const registry = (globalThis as { __sheetsCalendarSync?: typeof HANDLERS }).__sheetsCalendarSync;
    expect(registry?.syncNow).toBe(HANDLERS.syncNow);
    expect(registry?.dryRun).toBe(HANDLERS.dryRun);
    expect(typeof registry?.onOpen).toBe('function');
    expect(typeof registry?.installHourlyTrigger).toBe('function');
    expect(typeof registry?.removeSyncTriggers).toBe('function');
  });
});
