import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, parseCsv, runSync } from '../src/index.js';
import { createMemoryCalendar } from '../src/memoryCalendar.js';
import { applyAppointmentIds, applyOutcomes } from '../src/sheetEdit.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const csv = readFileSync(join(root, 'sample-data', 'appointments.csv'), 'utf8');

function loadSheet(): string[][] {
  return parseCsv(csv).map((row) => [...row]);
}

describe('sample appointments', () => {
  it('plans the fictional sheet without writing', () => {
    const matrix = loadSheet();
    const calendar = createMemoryCalendar();
    const report = runSync({
      matrix,
      config: DEFAULT_CONFIG,
      dryRun: true,
      calendar,
      createId: (rowNumber) => `APT-${rowNumber}-demo`,
      writeAppointmentIds: () => {
        throw new Error('dry run wrote ids');
      },
      writeOutcomes: () => {
        throw new Error('dry run wrote outcomes');
      },
    });

    expect(report.ok).toBe(true);
    expect(report.counts).toEqual({
      created: 8,
      updated: 0,
      deleted: 0,
      markedCancelled: 0,
      linked: 0,
      unchanged: 0,
      alreadyCancelled: 0,
      cancelNoop: 3,
      invalid: 4,
      failed: 0,
    });
    expect(report.log.join('\n')).toContain('2026-04-08 09:00–11:00 Europe/London');
    expect(report.log.join('\n')).toContain('2026-04-13 23:30–2026-04-14 01:00 Europe/London');
    expect(report.log.join('\n')).toContain('DRY RUN Row 16 | APT-16-demo | Harper Singh | create');
    expect(calendar.calls).toEqual([]);
    expect(matrix[15]?.[0]).toBe('');
  });

  it('creates once and then leaves matching events alone', () => {
    const matrix = loadSheet();
    const calendar = createMemoryCalendar();
    const run = (dryRun: boolean) =>
      runSync({
        matrix,
        config: DEFAULT_CONFIG,
        dryRun,
        calendar,
        createId: (rowNumber) => `APT-${rowNumber}-demo`,
        writeAppointmentIds: (updates) => applyAppointmentIds(matrix, 1, updates),
        writeOutcomes: (outcomes) => applyOutcomes(matrix, 1, outcomes),
      });

    const first = run(false);
    expect(first.counts.created).toBe(8);
    expect(calendar.events.size).toBe(8);
    const harper = matrix.find((row) => row[1] === 'Harper Singh');
    expect(harper?.[0]).toBe('APT-16-demo');
    expect(harper?.[9]).toBe('Created');
    const quinn = [...calendar.events.values()].find((event) => event.summary === 'Quinn Adler');
    expect(quinn?.description).toContain('send the lookbook');

    const calls = calendar.calls.length;
    const second = run(false);
    expect(second.counts).toMatchObject({ created: 0, updated: 0, unchanged: 8, invalid: 4, cancelNoop: 3 });
    expect(calendar.calls.length).toBe(calls);
  });
});
