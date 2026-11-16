import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ConfigError, DEFAULT_CONFIG, parseConfigSheet, resolveConfig } from '../src/config.js';
import { parseCsv } from '../src/csv.js';

describe('config', () => {
  it('keeps defaults when the config tab is empty', () => {
    expect(resolveConfig(parseConfigSheet([]).overrides)).toEqual(DEFAULT_CONFIG);
  });

  it('reads the sample config and ignores a header row', () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..');
    const matrix = parseCsv(readFileSync(join(root, 'sample-data', 'config.csv'), 'utf8'));
    const parsed = parseConfigSheet(matrix);
    expect(parsed.warnings).toEqual([]);
    expect(resolveConfig(parsed.overrides)).toMatchObject({
      calendarId: 'primary',
      sheetName: 'Appointments',
      timezone: 'Europe/London',
      headerRow: 1,
      cancelMode: 'delete',
      maxRows: 500,
    });
  });

  it('lets a blank cell fall back to the code default', () => {
    const parsed = parseConfigSheet([
      ['Time zone', ''],
      ['Cancel mode', 'mark'],
    ]);
    expect(resolveConfig(parsed.overrides).timezone).toBe('Europe/London');
    expect(resolveConfig(parsed.overrides).cancelMode).toBe('mark');
  });

  it('warns on unknown keys and rejects contradictions', () => {
    expect(parseConfigSheet([['Colour', 'blue']]).warnings[0]).toMatch(/Unknown config key/);
    expect(() => parseConfigSheet([['Calendar ID', 'a'], ['calendar', 'b']])).toThrow(ConfigError);
    expect(() => resolveConfig({ timezone: 'Mars/Olympus' })).toThrow(/IANA/);
    expect(() => resolveConfig({ sheetName: 'Config' })).toThrow(/different tabs/);
    expect(() => resolveConfig({ headerRow: 0 })).toThrow(/Header row/);
    expect(() => parseConfigSheet([['Cancel mode', 'archive']])).toThrow(/delete/);
  });
});
