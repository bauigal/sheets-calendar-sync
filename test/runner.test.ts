import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, resolveConfig } from '../src/config.js';
import { createMemoryCalendar } from '../src/memoryCalendar.js';
import { runSync } from '../src/runner.js';
import { applyAppointmentIds, applyOutcomes } from '../src/sheetEdit.js';
import type { CalendarPort, RowOutcome, SyncConfig } from '../src/types.js';
import { HEADER, dataRow } from './helpers.js';

function matrixOf(rows: Record<string, string>[]): string[][] {
  return [HEADER, ...rows.map((row) => dataRow(row))];
}

function sync(matrix: string[][], options: { dryRun?: boolean; config?: SyncConfig; calendar?: ReturnType<typeof createMemoryCalendar>; throwOnWrite?: boolean } = {}) {
  const calendar = options.calendar ?? createMemoryCalendar();
  const config = options.config ?? DEFAULT_CONFIG;
  const writes: string[] = [];
  const report = runSync({
    matrix,
    config,
    dryRun: options.dryRun ?? false,
    calendar,
    createId: (rowNumber) => `APT-NEW-${rowNumber}`,
    writeAppointmentIds: (updates) => {
      writes.push('ids');
      if (options.throwOnWrite) throw new Error('sheet write failed');
      applyAppointmentIds(matrix, config.headerRow, updates);
    },
    writeOutcomes: (outcomes) => {
      writes.push('outcomes');
      if (options.throwOnWrite) throw new Error('outcome write failed');
      applyOutcomes(matrix, config.headerRow, outcomes);
    },
  });
  return { report, calendar, writes, matrix };
}

const avery = {
  'Appointment ID': 'APT-1',
  'Client name': 'Avery Quinn',
  Date: '2026-04-07',
  'Start time': '09:30',
  'Duration (minutes)': '60',
  Location: 'Studio',
  Notes: 'Bring samples',
  Status: 'scheduled',
};

describe('runSync', () => {
  it('does not write anything during a dry run', () => {
    const sheet = matrixOf([avery, { 'Client name': 'Harper', Date: '2026-04-17', 'Start time': '13:30', 'Duration (minutes)': '60' }]);
    const before = JSON.stringify(sheet);
    const { report, calendar } = sync(sheet, { dryRun: true });
    expect(JSON.stringify(sheet)).toBe(before);
    expect(calendar.calls).toEqual([]);
    expect(report.counts).toMatchObject({ created: 2, invalid: 0 });
    expect(report.log[0]).toMatch(/^DRY RUN /);
    expect(report.log.at(-1)).toMatch(/No changes written/);
    expect(report.outcomes).toEqual([]);
  });

  it('writes new appointment ids before creating events', () => {
    const order: string[] = [];
    const sheet = matrixOf([{ 'Client name': 'Harper', Date: '2026-04-17', 'Start time': '13:30', 'Duration (minutes)': '60' }]);
    const calendar = createMemoryCalendar();
    const original = calendar.createEvent.bind(calendar);
    calendar.createEvent = (draft) => {
      order.push(`create:${draft.appointmentKey}`);
      return original(draft);
    };
    runSync({
      matrix: sheet,
      config: DEFAULT_CONFIG,
      dryRun: false,
      calendar,
      createId: () => 'APT-NEW-2',
      writeAppointmentIds: (updates) => {
        order.push(`ids:${updates.map((update) => update.appointmentId).join(',')}`);
        applyAppointmentIds(sheet, 1, updates);
      },
      writeOutcomes: (outcomes) => applyOutcomes(sheet, 1, outcomes),
    });
    expect(order).toEqual(['ids:APT-NEW-2', 'create:APT-NEW-2']);
    expect(sheet[1]?.[0]).toBe('APT-NEW-2');
    expect(sheet[1]?.[8]).toBe('evt-1');
    expect(sheet[1]?.[9]).toBe('Created');
  });

  it('updates on the second run instead of creating a duplicate', () => {
    const sheet = matrixOf([avery]);
    const calendar = createMemoryCalendar();
    const first = sync(sheet, { calendar });
    expect(first.report.counts.created).toBe(1);
    expect(calendar.events.size).toBe(1);

    sheet[1]![3] = '10:15';
    const callsBefore = calendar.calls.length;
    const second = sync(sheet, { calendar });
    expect(second.report.counts).toMatchObject({ created: 0, updated: 1 });
    expect(calendar.calls.slice(callsBefore)).toEqual([`update:${sheet[1]?.[8]}`]);
    expect(calendar.events.size).toBe(1);

    const third = sync(sheet, { calendar });
    expect(third.report.counts.unchanged).toBe(1);
    expect(calendar.calls.length).toBe(callsBefore + 1);
  });

  it('recovers an event by appointment key when the event id never landed in the sheet', () => {
    const sheet = matrixOf([avery]);
    const calendar = createMemoryCalendar();
    expect(() =>
      sync(sheet, {
        calendar,
        throwOnWrite: false,
      }),
    ).not.toThrow();

    const createdId = String(sheet[1]?.[8]);
    sheet[1]![8] = '';
    const callsBefore = calendar.calls.length;
    const again = sync(sheet, { calendar });
    expect(again.report.counts).toMatchObject({ created: 0, linked: 1 });
    expect(sheet[1]?.[8]).toBe(createdId);
    expect(calendar.calls.length).toBe(callsBefore);
    expect(calendar.events.size).toBe(1);
  });

  it('stops before any calendar write when saving new ids fails', () => {
    const sheet = matrixOf([{ 'Client name': 'Harper', Date: '2026-04-17', 'Start time': '13:30', 'Duration (minutes)': '60' }]);
    const calendar = createMemoryCalendar();
    expect(() => sync(sheet, { calendar, throwOnWrite: true })).toThrow(/sheet write failed/);
    expect(calendar.calls).toEqual([]);
  });

  it('deletes a cancelled event and clears the id', () => {
    const sheet = matrixOf([avery]);
    const calendar = createMemoryCalendar();
    sync(sheet, { calendar });
    sheet[1]![7] = 'cancelled';
    const result = sync(sheet, { calendar });
    expect(result.report.counts.deleted).toBe(1);
    expect(sheet[1]?.[8]).toBe('');
    expect(sheet[1]?.[9]).toBe('Deleted');
    expect(calendar.events.size).toBe(0);
  });

  it('marks an event cancelled without forgetting its id', () => {
    const sheet = matrixOf([avery]);
    const calendar = createMemoryCalendar();
    const config = resolveConfig({ cancelMode: 'mark' });
    sync(sheet, { calendar, config });
    const eventId = String(sheet[1]?.[8]);
    sheet[1]![7] = 'cancelled';
    const marked = sync(sheet, { calendar, config });
    expect(marked.report.counts.markedCancelled).toBe(1);
    expect(sheet[1]?.[8]).toBe(eventId);
    expect(calendar.events.get(eventId)?.status).toBe('cancelled');

    const again = sync(sheet, { calendar, config });
    expect(again.report.counts.alreadyCancelled).toBe(1);
    expect(calendar.calls.filter((call) => call.startsWith('cancel:'))).toHaveLength(1);
  });

  it('flags bad rows and still syncs the valid ones', () => {
    const sheet = matrixOf([
      avery,
      { 'Appointment ID': 'APT-2', Date: 'nope', 'Start time': '09:00', 'Duration (minutes)': '30', 'Client name': 'Morgan' },
    ]);
    const { report, calendar } = sync(sheet);
    expect(report.counts).toMatchObject({ created: 1, invalid: 1 });
    expect(sheet[2]?.[9]).toMatch(/^Error: Date /);
    expect(calendar.events.size).toBe(1);
  });

  it('records a row failure and continues with the next row', () => {
    const sheet = matrixOf([
      avery,
      { ...avery, 'Appointment ID': 'APT-2', 'Client name': 'Jordan Blake', 'Start time': '11:00' },
    ]);
    const calendar = createMemoryCalendar();
    const port: CalendarPort = {
      ...calendar,
      createEvent(draft) {
        if (draft.appointmentKey === 'APT-1') throw new Error('calendar quota');
        return calendar.createEvent(draft);
      },
    };
    const outcomes: RowOutcome[] = [];
    const report = runSync({
      matrix: sheet,
      config: DEFAULT_CONFIG,
      dryRun: false,
      calendar: port,
      createId: (rowNumber) => `APT-${rowNumber}`,
      writeAppointmentIds: () => undefined,
      writeOutcomes: (rows) => {
        outcomes.push(...rows);
        applyOutcomes(sheet, 1, rows);
      },
    });
    expect(report.counts).toMatchObject({ failed: 1, created: 1 });
    expect(outcomes[0]?.syncResult).toBe('Failed: calendar quota');
    expect(sheet[2]?.[9]).toBe('Created');
  });

  it('returns a sheet-level error without writing when the header is missing', () => {
    const sheet = [['Client name'], ['Avery']];
    const { report, writes } = sync(sheet);
    expect(report.ok).toBe(false);
    expect(report.error).toMatch(/Missing required columns/);
    expect(writes).toEqual([]);
  });
});
