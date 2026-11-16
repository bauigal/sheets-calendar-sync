import { DateTime, IANAZone } from 'luxon';

/**
 * Google Sheets stores dates as days since 1899-12-30, with the Lotus
 * 1900 leap-year bug baked into the count. 25569 is 1970-01-01 in that
 * system, so converting through the Unix epoch keeps modern dates correct
 * without re-implementing the phantom 29 February 1900.
 */
const SHEETS_UNIX_EPOCH_SERIAL = 25569;
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

export function dateFromSheetsSerial(serial: number): string | null {
  if (!Number.isFinite(serial)) return null;
  const whole = Math.floor(serial);
  if (whole < 1) return null;
  const millis = Date.UTC(1970, 0, 1) + (whole - SHEETS_UNIX_EPOCH_SERIAL) * 86_400_000;
  const dt = DateTime.fromMillis(millis, { zone: 'utc' });
  if (!dt.isValid || dt.year < MIN_YEAR || dt.year > MAX_YEAR) return null;
  return dt.toISODate();
}

/**
 * Day-first when both readings are possible (`08/04/2026` is 8 April).
 * Month-first is only used when the day-first reading is impossible
 * (`04/13/2026` is 13 April). Unambiguous ISO dates are preferred.
 */
export function parseDateText(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  for (const format of ['yyyy-M-d', 'yyyy/M/d', 'd MMM yyyy', 'd MMMM yyyy', 'd-M-yyyy']) {
    const iso = formatDate(trimmed, format);
    if (iso) return iso;
  }

  if (trimmed.includes('/')) {
    const dayFirst = formatDate(trimmed, 'd/M/yyyy');
    if (dayFirst) return dayFirst;
    return formatDate(trimmed, 'M/d/yyyy');
  }
  return null;
}

function formatDate(text: string, format: string): string | null {
  const dt = DateTime.fromFormat(text, format, { zone: 'utc', locale: 'en-GB' });
  if (!dt.isValid || dt.year < MIN_YEAR || dt.year > MAX_YEAR) return null;
  return dt.toISODate();
}

export function parseTimeText(text: string): string | null {
  const trimmed = text.trim().toLowerCase().replace(/\s+/g, ' ');
  const match24 = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (match24) {
    const seconds = match24[3] ? Number(match24[3]) : 0;
    if (seconds !== 0) return null;
    return hoursMinutes(Number(match24[1]), Number(match24[2]));
  }
  const match12 = trimmed.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/);
  if (!match12) return null;
  let hours = Number(match12[1]);
  const minutes = Number(match12[2]);
  if (hours < 1 || hours > 12) return null;
  if (match12[3] === 'am' && hours === 12) hours = 0;
  if (match12[3] === 'pm' && hours !== 12) hours += 12;
  return hoursMinutes(hours, minutes);
}

function hoursMinutes(hours: number, minutes: number): string | null {
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return `${pad(hours)}:${pad(minutes)}`;
}

export function fractionToHm(fraction: number): string | null {
  if (!Number.isFinite(fraction) || fraction < 0 || fraction >= 1) return null;
  const minutes = fraction * 1440;
  const rounded = Math.round(minutes);
  if (Math.abs(minutes - rounded) > 1e-4) return null;
  if (rounded < 0 || rounded >= 1440) return null;
  return `${pad(Math.floor(rounded / 60))}:${pad(rounded % 60)}`;
}

/**
 * Wall-clock times are not always one instant. Europe/London skips an hour
 * in March and repeats an hour in October. Calendar sync must not guess
 * which one the user meant, and must not book a time that does not exist.
 *
 * The check asks the zone which offsets it uses around that local day, then
 * counts how many of those offsets reproduce the same wall clock.
 */
export type WallTime =
  | { kind: 'ok'; start: DateTime }
  | { kind: 'invalid-zone' }
  | { kind: 'gap' }
  | { kind: 'overlap' };

export function inspectWallTime(
  zoneName: string,
  parts: { year: number; month: number; day: number; hour: number; minute: number },
): WallTime {
  if (!IANAZone.isValidZone(zoneName)) return { kind: 'invalid-zone' };
  const zone = IANAZone.create(zoneName);
  const localAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
  const offsets = new Set<number>();
  const sweepStart = Date.UTC(parts.year, parts.month - 1, parts.day - 1);
  const sweepEnd = Date.UTC(parts.year, parts.month - 1, parts.day + 2);
  for (let instant = sweepStart; instant <= sweepEnd; instant += 30 * 60 * 1000) {
    offsets.add(zone.offset(instant));
  }

  const matches = new Map<number, DateTime>();
  for (const offset of offsets) {
    const millis = localAsUtc - offset * 60 * 1000;
    const dt = DateTime.fromMillis(millis, { zone: zoneName });
    if (
      dt.year === parts.year &&
      dt.month === parts.month &&
      dt.day === parts.day &&
      dt.hour === parts.hour &&
      dt.minute === parts.minute
    ) {
      matches.set(dt.toMillis(), dt);
    }
  }

  if (matches.size === 0) return { kind: 'gap' };
  if (matches.size > 1) return { kind: 'overlap' };
  const start = [...matches.values()][0];
  if (!start) return { kind: 'gap' };
  return { kind: 'ok', start };
}

export function sameInstant(
  left: { dateTime: string; timeZone: string },
  right: { dateTime: string; timeZone: string },
): boolean {
  const a = instantMillis(left);
  const b = instantMillis(right);
  return a !== null && b !== null && a === b;
}

export function instantMillis(spec: { dateTime: string; timeZone: string }): number | null {
  if (!spec.dateTime) return null;
  const hasOffset = /(?:[zZ]|[+-]\d{2}:\d{2})$/.test(spec.dateTime);
  const dt = hasOffset
    ? DateTime.fromISO(spec.dateTime, { setZone: true })
    : DateTime.fromISO(spec.dateTime, { zone: spec.timeZone || 'utc' });
  return dt.isValid ? dt.toMillis() : null;
}

export function formatRange(startIso: string, endIso: string, zone: string): string {
  const start = DateTime.fromISO(startIso, { setZone: true }).setZone(zone);
  const end = DateTime.fromISO(endIso, { setZone: true }).setZone(zone);
  if (!start.isValid || !end.isValid) return `${startIso}–${endIso} ${zone}`;
  if (start.toISODate() === end.toISODate()) {
    return `${start.toFormat('yyyy-MM-dd HH:mm')}–${end.toFormat('HH:mm')} ${zone}`;
  }
  return `${start.toFormat('yyyy-MM-dd HH:mm')}–${end.toFormat('yyyy-MM-dd HH:mm')} ${zone}`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
