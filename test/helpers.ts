import { buildEventDraft } from '../src/mapping.js';
import type { CalendarEventSnapshot, EventDraft, ValidRow } from '../src/types.js';

export const HEADER = [
  'Appointment ID',
  'Client name',
  'Date',
  'Start time',
  'Duration (minutes)',
  'Location',
  'Notes',
  'Status',
  'Calendar event ID',
  'Sync result',
];

export function validRow(overrides: Partial<ValidRow> = {}): ValidRow {
  return {
    rowNumber: 2,
    appointmentId: 'APT-1',
    clientName: 'Avery Quinn',
    dateIso: '2026-04-07',
    timeHm: '09:30',
    durationMinutes: 60,
    location: 'Studio',
    notes: 'Bring samples',
    status: 'scheduled',
    eventId: '',
    ...overrides,
  };
}

export function draftFor(overrides: Partial<ValidRow> = {}, timezone = 'Europe/London'): EventDraft {
  const result = buildEventDraft(validRow(overrides), timezone);
  if (!result.ok) throw new Error(result.errors.join(' '));
  return result.draft;
}

export function snapshotFrom(draft: EventDraft, overrides: Partial<CalendarEventSnapshot> = {}): CalendarEventSnapshot {
  return {
    id: 'evt-1',
    summary: draft.summary,
    description: draft.description,
    location: draft.location,
    start: { ...draft.start },
    end: { ...draft.end },
    appointmentKey: draft.appointmentKey,
    status: 'confirmed',
    ...overrides,
  };
}

export function dataRow(cells: Partial<Record<(typeof HEADER)[number], string>>): string[] {
  return HEADER.map((name) => cells[name] ?? '');
}
