import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { buildDescription, buildEventDraft } from '../src/mapping.js';
import { draftFor, validRow } from './helpers.js';

describe('buildEventDraft', () => {
  it('uses the client name as the title and stamps the appointment id into the description', () => {
    const draft = draftFor({ notes: 'Bring samples', location: '14 Wren Lane' });
    expect(draft.summary).toBe('Avery Quinn');
    expect(draft.location).toBe('14 Wren Lane');
    expect(draft.description).toBe(buildDescription('Bring samples', 'APT-1'));
    expect(draft.description).toContain('Appointment ID: APT-1');
    expect(draft.start.timeZone).toBe('Europe/London');
    expect(draft.end.timeZone).toBe('Europe/London');
  });

  it('ends a 23:30 appointment ninety minutes later on the next calendar day', () => {
    const draft = draftFor({ dateIso: '2026-04-13', timeHm: '23:30', durationMinutes: 90 });
    const end = DateTime.fromISO(draft.end.dateTime, { setZone: true }).setZone('Europe/London');
    expect(end.toFormat('yyyy-MM-dd HH:mm')).toBe('2026-04-14 01:00');
  });

  it('counts duration in real minutes across the spring-forward gap', () => {
    const draft = draftFor({ dateIso: '2026-03-29', timeHm: '00:30', durationMinutes: 60 });
    const start = DateTime.fromISO(draft.start.dateTime, { setZone: true });
    const end = DateTime.fromISO(draft.end.dateTime, { setZone: true });
    expect(end.toMillis() - start.toMillis()).toBe(60 * 60 * 1000);
    expect(end.setZone('Europe/London').toFormat('HH:mm')).toBe('02:30');
  });

  it('rejects an overlap instead of guessing which 01:30 was meant', () => {
    const result = buildEventDraft(validRow({ dateIso: '2026-10-25', timeHm: '01:30' }), 'Europe/London');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatch(/happens twice/);
  });
});
