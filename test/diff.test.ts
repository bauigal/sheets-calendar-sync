import { describe, expect, it } from 'vitest';
import { buildPlan, changedFields, indexEvents } from '../src/diff.js';
import type { CalendarEventSnapshot, EventDraft } from '../src/types.js';
import type { PreparedRow } from '../src/validation.js';
import { draftFor, snapshotFrom } from './helpers.js';

function ready(draft: EventDraft, extras: { eventId?: string; generatedId?: boolean; rowNumber?: number } = {}): PreparedRow {
  return {
    kind: 'ready',
    rowNumber: extras.rowNumber ?? 2,
    appointmentId: draft.appointmentKey,
    clientName: draft.summary,
    eventId: extras.eventId ?? '',
    generatedId: extras.generatedId ?? false,
    draft,
    status: 'scheduled',
  };
}

function cancelled(appointmentId: string, eventId = ''): PreparedRow {
  return {
    kind: 'ready',
    rowNumber: 4,
    appointmentId,
    clientName: 'Sam Okonkwo',
    eventId,
    generatedId: false,
    draft: null,
    status: 'cancelled',
  };
}

describe('changedFields', () => {
  it('ignores an offset-versus-Zulu spelling of the same instant', () => {
    const draft = draftFor();
    const current = snapshotFrom(draft, {
      start: { dateTime: '2026-04-07T08:30:00Z', timeZone: 'Europe/London' },
      end: { dateTime: '2026-04-07T09:30:00Z', timeZone: 'Europe/London' },
    });
    expect(changedFields(current, draft)).toEqual([]);
  });

  it('lists title, start, and end when those differ', () => {
    const draft = draftFor();
    const moved = draftFor({ timeHm: '10:00', clientName: 'Avery Q.' });
    expect(changedFields(snapshotFrom(draft), moved)).toEqual(['title', 'start', 'end']);
  });
});

describe('buildPlan', () => {
  const draft = draftFor();

  it('creates when nothing matches', () => {
    const [action] = buildPlan([ready(draft)], indexEvents([]), { cancelMode: 'delete' });
    expect(action).toMatchObject({ kind: 'create' });
  });

  it('stays quiet when the stored event already matches', () => {
    const event = snapshotFrom(draft);
    const [action] = buildPlan([ready(draft, { eventId: event.id })], indexEvents([event]), { cancelMode: 'delete' });
    expect(action).toMatchObject({ kind: 'unchanged', relink: false });
  });

  it('updates only the fields that changed', () => {
    const event = snapshotFrom(draft);
    const next = draftFor({ location: 'Cafe North' });
    const [action] = buildPlan([ready(next, { eventId: event.id })], indexEvents([event]), { cancelMode: 'delete' });
    expect(action).toMatchObject({ kind: 'update', changes: ['location'] });
  });

  it('links an event found by appointment key when the sheet has no event id', () => {
    const event = snapshotFrom(draft, { id: 'evt-found' });
    const [action] = buildPlan([ready(draft)], indexEvents([event]), { cancelMode: 'delete' });
    expect(action).toMatchObject({ kind: 'unchanged', eventId: 'evt-found', relink: true });
  });

  it('recreates when the stored id is gone and the key matches nothing', () => {
    const [action] = buildPlan([ready(draft, { eventId: 'evt-missing' })], indexEvents([]), { cancelMode: 'delete' });
    expect(action).toMatchObject({ kind: 'create' });
  });

  it('does not pick a winner when two events share a key', () => {
    const events = [snapshotFrom(draft, { id: 'evt-a' }), snapshotFrom(draft, { id: 'evt-b' })];
    const [action] = buildPlan([ready(draft)], indexEvents(events), { cancelMode: 'delete' });
    expect(action).toMatchObject({ kind: 'invalid' });
  });

  it('deletes a cancelled row, or marks it when that mode is selected', () => {
    const event = snapshotFrom(draft, { id: 'evt-9', appointmentKey: 'APT-9' });
    const row = cancelled('APT-9', 'evt-9');
    expect(buildPlan([row], indexEvents([event]), { cancelMode: 'delete' })[0]).toMatchObject({ kind: 'delete' });
    expect(buildPlan([row], indexEvents([event]), { cancelMode: 'mark' })[0]).toMatchObject({ kind: 'mark-cancelled' });
  });

  it('clears a stale id when a cancelled row no longer has an event', () => {
    const [action] = buildPlan([cancelled('APT-9', 'evt-gone')], indexEvents([]), { cancelMode: 'delete' });
    expect(action).toMatchObject({ kind: 'cancel-noop', clearEventId: true });
  });

  it('reopens a cancelled event when the row is scheduled again', () => {
    const event: CalendarEventSnapshot = snapshotFrom(draft, { status: 'cancelled' });
    const [action] = buildPlan([ready(draft, { eventId: event.id })], indexEvents([event]), { cancelMode: 'mark' });
    expect(action).toMatchObject({ kind: 'update', changes: ['status'] });
  });

  it('leaves an already cancelled event alone in mark mode', () => {
    const event = snapshotFrom(draft, { id: 'evt-9', appointmentKey: 'APT-9', status: 'cancelled' });
    const [action] = buildPlan([cancelled('APT-9', 'evt-9')], indexEvents([event]), { cancelMode: 'mark' });
    expect(action).toMatchObject({ kind: 'already-cancelled', relink: false });
  });
});
