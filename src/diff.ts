import type { CalendarEventSnapshot, EventDraft, EventIndex, PlanAction, SyncConfig } from './types.js';
import type { PreparedRow } from './validation.js';
import { sameInstant } from './time.js';

const FIELD_ORDER = ['title', 'location', 'notes', 'start', 'end', 'time zone', 'appointment key'] as const;

/**
 * Match a row to an event by the stored calendar id first. If that id is
 * missing or no longer on the calendar, fall back to the private
 * `appointmentKey` property written when the event was created. That second
 * key is what stops a duplicate when a previous run created the event and
 * then failed before it could save the id back to the sheet.
 */
export function buildPlan(rows: PreparedRow[], index: EventIndex, config: Pick<SyncConfig, 'cancelMode'>): PlanAction[] {
  return rows.map((row) => planRow(row, index, config));
}

function planRow(row: PreparedRow, index: EventIndex, config: Pick<SyncConfig, 'cancelMode'>): PlanAction {
  if (row.kind === 'invalid') {
    return {
      kind: 'invalid',
      rowNumber: row.rowNumber,
      appointmentId: row.appointmentId,
      clientName: row.clientName,
      errors: row.errors,
    };
  }

  const base = {
    rowNumber: row.rowNumber,
    appointmentId: row.appointmentId,
    clientName: row.clientName,
  };
  const match = findEvent(row, index);
  if (match.kind === 'ambiguous') {
    return {
      kind: 'invalid',
      ...base,
      errors: [`More than one calendar event has appointment key ${row.appointmentId}.`],
    };
  }
  const event = match.event;
  const relink = Boolean(event) && row.eventId !== event?.id;

  if (row.status === 'cancelled') {
    if (!event) {
      return {
        kind: 'cancel-noop',
        ...base,
        clearEventId: Boolean(row.eventId),
        reason: row.eventId ? 'Stored event id was not on the calendar.' : 'No calendar event is linked to this row.',
      };
    }
    if (config.cancelMode === 'mark') {
      if (event.status === 'cancelled') {
        return { kind: 'already-cancelled', ...base, eventId: event.id, relink };
      }
      return { kind: 'mark-cancelled', ...base, eventId: event.id, relink };
    }
    return { kind: 'delete', ...base, eventId: event.id };
  }

  if (!row.draft) {
    return { kind: 'invalid', ...base, errors: ['This row has no calendar draft.'] };
  }
  if (!event) {
    return { kind: 'create', ...base, draft: row.draft };
  }

  const changes = changedFields(event, row.draft);
  if (event.status !== 'confirmed') changes.push('status');
  if (changes.length === 0) {
    return { kind: 'unchanged', ...base, eventId: event.id, relink };
  }
  return { kind: 'update', ...base, eventId: event.id, draft: row.draft, changes, relink };
}

function findEvent(
  row: Extract<PreparedRow, { kind: 'ready' }>,
  index: EventIndex,
): { kind: 'one'; event: CalendarEventSnapshot | null } | { kind: 'ambiguous' } {
  if (row.eventId) {
    const byId = index.byId.get(row.eventId);
    if (byId) return { kind: 'one', event: byId };
  }
  if (!row.appointmentId || row.generatedId) return { kind: 'one', event: null };
  const matches = index.byKey.get(row.appointmentId) ?? [];
  if (matches.length > 1) return { kind: 'ambiguous' };
  return { kind: 'one', event: matches[0] ?? null };
}

export function changedFields(current: CalendarEventSnapshot, draft: EventDraft): string[] {
  const changes: string[] = [];
  if (norm(current.summary) !== norm(draft.summary)) changes.push('title');
  if (norm(current.location) !== norm(draft.location)) changes.push('location');
  if (normMultiline(current.description) !== normMultiline(draft.description)) changes.push('notes');
  if (!sameInstant(current.start, draft.start)) changes.push('start');
  if (!sameInstant(current.end, draft.end)) changes.push('end');
  if ((current.start.timeZone || '') !== draft.start.timeZone || (current.end.timeZone || '') !== draft.end.timeZone) {
    changes.push('time zone');
  }
  if ((current.appointmentKey || '') !== draft.appointmentKey) changes.push('appointment key');
  return changes.filter((field, index) => changes.indexOf(field) === index).sort(byFieldOrder);
}

export function indexEvents(events: CalendarEventSnapshot[]): EventIndex {
  const byId = new Map<string, CalendarEventSnapshot>();
  for (const event of events) byId.set(event.id, event);
  const byKey = new Map<string, CalendarEventSnapshot[]>();
  for (const event of byId.values()) {
    if (!event.appointmentKey) continue;
    const list = byKey.get(event.appointmentKey) ?? [];
    list.push(event);
    byKey.set(event.appointmentKey, list);
  }
  return { byId, byKey };
}

function byFieldOrder(left: string, right: string): number {
  const ai = FIELD_ORDER.indexOf(left as (typeof FIELD_ORDER)[number]);
  const bi = FIELD_ORDER.indexOf(right as (typeof FIELD_ORDER)[number]);
  return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
}

function norm(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normMultiline(value: string): string {
  return value.replace(/\r\n/g, '\n').trim();
}
