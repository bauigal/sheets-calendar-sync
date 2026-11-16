import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import {
  dateFromSheetsSerial,
  fractionToHm,
  inspectWallTime,
  parseDateText,
  parseTimeText,
  sameInstant,
} from '../src/time.js';

describe('parseDateText', () => {
  it('prefers ISO dates', () => {
    expect(parseDateText('2026-04-07')).toBe('2026-04-07');
    expect(parseDateText('2026-4-8')).toBe('2026-04-08');
  });

  it('reads slash dates as day-first when both readings are possible', () => {
    expect(parseDateText('08/04/2026')).toBe('2026-04-08');
    expect(parseDateText('8/4/2026')).toBe('2026-04-08');
  });

  it('falls back to month-first only when day-first is impossible', () => {
    expect(parseDateText('04/13/2026')).toBe('2026-04-13');
  });

  it('accepts month names and rejects impossible days', () => {
    expect(parseDateText('8 April 2026')).toBe('2026-04-08');
    expect(parseDateText('31/02/2026')).toBeNull();
    expect(parseDateText('not-a-date')).toBeNull();
  });
});

describe('parseTimeText', () => {
  it('normalises 24-hour and 12-hour times', () => {
    expect(parseTimeText('9:30')).toBe('09:30');
    expect(parseTimeText('09:30:00')).toBe('09:30');
    expect(parseTimeText('9:00 AM')).toBe('09:00');
    expect(parseTimeText('12:00 am')).toBe('00:00');
    expect(parseTimeText('12:30 PM')).toBe('12:30');
    expect(parseTimeText('1:15 pm')).toBe('13:15');
  });

  it('rejects times that are not a real minute', () => {
    expect(parseTimeText('24:00')).toBeNull();
    expect(parseTimeText('09:60')).toBeNull();
    expect(parseTimeText('09:30:45')).toBeNull();
  });
});

describe('sheet serials and fractions', () => {
  it('anchors the Sheets epoch at 1970-01-01 = 25569', () => {
    expect(dateFromSheetsSerial(25569)).toBe('1970-01-01');
    const serial = (Date.UTC(2026, 3, 7) - Date.UTC(1970, 0, 1)) / 86_400_000 + 25569;
    expect(dateFromSheetsSerial(serial)).toBe('2026-04-07');
  });

  it('turns a day fraction into a clock time', () => {
    expect(fractionToHm(9.5 / 24)).toBe('09:30');
    expect(fractionToHm(0)).toBe('00:00');
  });
});

describe('daylight saving wall times', () => {
  it('rejects the missing hour when Europe/London springs forward', () => {
    expect(inspectWallTime('Europe/London', { year: 2026, month: 3, day: 29, hour: 1, minute: 30 }).kind).toBe('gap');
  });

  it('rejects the repeated hour when Europe/London falls back', () => {
    expect(inspectWallTime('Europe/London', { year: 2026, month: 10, day: 25, hour: 1, minute: 30 }).kind).toBe('overlap');
  });

  it('accepts an ordinary morning', () => {
    const wall = inspectWallTime('Europe/London', { year: 2026, month: 4, day: 7, hour: 9, minute: 30 });
    expect(wall.kind).toBe('ok');
  });

  it('treats the same instant with an offset and a Zulu stamp as equal', () => {
    const left = { dateTime: '2026-04-07T09:30:00+01:00', timeZone: 'Europe/London' };
    const right = { dateTime: '2026-04-07T08:30:00Z', timeZone: 'Europe/London' };
    expect(sameInstant(left, right)).toBe(true);
    expect(DateTime.fromISO(left.dateTime).toMillis()).toBe(DateTime.fromISO(right.dateTime).toMillis());
  });
});
