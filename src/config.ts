import { IANAZone } from 'luxon';
import type { CancelMode, SyncConfig } from './types.js';

/**
 * Defaults used when the Config tab is missing or a cell is blank.
 * Edit these, or override them from a sheet tab named in `configSheetName`
 * (see the README) so a spreadsheet editor can change them without clasp.
 */
export const DEFAULT_CONFIG: SyncConfig = {
  calendarId: 'primary',
  sheetName: 'Appointments',
  configSheetName: 'Config',
  timezone: 'Europe/London',
  headerRow: 1,
  cancelMode: 'delete',
  maxRows: 500,
};

const KEY_ALIASES: Record<string, keyof SyncConfig> = {
  calendarid: 'calendarId',
  'calendar id': 'calendarId',
  calendar: 'calendarId',
  sheetname: 'sheetName',
  'sheet name': 'sheetName',
  sheet: 'sheetName',
  tab: 'sheetName',
  timezone: 'timezone',
  'time zone': 'timezone',
  tz: 'timezone',
  headerrow: 'headerRow',
  'header row': 'headerRow',
  cancelmode: 'cancelMode',
  'cancel mode': 'cancelMode',
  maxrows: 'maxRows',
  'max rows': 'maxRows',
};

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export interface ConfigParse {
  overrides: Partial<SyncConfig>;
  warnings: string[];
}

function normaliseKey(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}

function cellText(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return '';
  return String(value).trim();
}

/**
 * Read a two-column Config tab. A header row of "Key" / "Value" is optional.
 * Unknown keys are warnings, not failures. Blank values are ignored so the
 * code default stands.
 */
export function parseConfigSheet(matrix: unknown[][]): ConfigParse {
  const overrides: Partial<SyncConfig> = {};
  const warnings: string[] = [];
  const seen = new Set<keyof SyncConfig>();

  for (let i = 0; i < matrix.length; i += 1) {
    const row = matrix[i] ?? [];
    const rawKey = cellText(row[0]);
    const rawValue = cellText(row[1]);
    if (!rawKey && !rawValue) continue;
    const key = normaliseKey(rawKey);
    if ((key === 'key' || key === 'setting' || key === 'name') && i === 0) continue;
    if (!rawKey) continue;

    const field = KEY_ALIASES[key];
    if (!field) {
      warnings.push(`Unknown config key "${rawKey}" on row ${i + 1}.`);
      continue;
    }
    if (!rawValue) continue;
    if (seen.has(field)) {
      throw new ConfigError(`Config key "${rawKey}" is set more than once.`);
    }
    seen.add(field);
    assignOverride(overrides, field, rawValue, i + 1);
  }

  return { overrides, warnings };
}

function assignOverride(
  overrides: Partial<SyncConfig>,
  field: keyof SyncConfig,
  rawValue: string,
  rowNumber: number,
): void {
  if (field === 'headerRow' || field === 'maxRows') {
    if (!/^\d+$/.test(rawValue)) {
      throw new ConfigError(`Config ${field} "${rawValue}" on row ${rowNumber} must be a whole number.`);
    }
    overrides[field] = Number(rawValue);
    return;
  }
  if (field === 'cancelMode') {
    const mode = rawValue.toLowerCase();
    if (mode !== 'delete' && mode !== 'mark') {
      throw new ConfigError(
        `Config cancel mode "${rawValue}" must be "delete" or "mark".`,
      );
    }
    overrides.cancelMode = mode;
    return;
  }
  overrides[field] = rawValue;
}

export function resolveConfig(overrides: Partial<SyncConfig> = {}, base: SyncConfig = DEFAULT_CONFIG): SyncConfig {
  const config: SyncConfig = {
    calendarId: overrides.calendarId?.trim() || base.calendarId,
    sheetName: overrides.sheetName?.trim() || base.sheetName,
    configSheetName: overrides.configSheetName?.trim() || base.configSheetName,
    timezone: overrides.timezone?.trim() || base.timezone,
    headerRow: overrides.headerRow ?? base.headerRow,
    cancelMode: (overrides.cancelMode ?? base.cancelMode) as CancelMode,
    maxRows: overrides.maxRows ?? base.maxRows,
  };

  if (!config.calendarId) {
    throw new ConfigError('Calendar ID is empty.');
  }
  if (!config.sheetName) {
    throw new ConfigError('Sheet name is empty.');
  }
  if (!config.configSheetName) {
    throw new ConfigError('Config sheet name is empty.');
  }
  if (config.sheetName === config.configSheetName) {
    throw new ConfigError('The appointment sheet and the config sheet must be different tabs.');
  }
  if (!Number.isInteger(config.headerRow) || config.headerRow < 1) {
    throw new ConfigError('Header row must be 1 or greater.');
  }
  if (!Number.isInteger(config.maxRows) || config.maxRows < 1) {
    throw new ConfigError('Max rows must be 1 or greater.');
  }
  if (config.cancelMode !== 'delete' && config.cancelMode !== 'mark') {
    throw new ConfigError('Cancel mode must be "delete" or "mark".');
  }
  if (!IANAZone.isValidZone(config.timezone)) {
    throw new ConfigError(`Time zone "${config.timezone}" is not a valid IANA time zone.`);
  }
  return config;
}
