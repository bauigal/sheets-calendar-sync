import {
  MAX_APPOINTMENT_ID_LENGTH,
  MAX_CLIENT_LENGTH,
  MAX_DURATION_MINUTES,
  MAX_LOCATION_LENGTH,
  MAX_NOTES_LENGTH,
} from './limits.js';
import { buildEventDraft } from './mapping.js';
import type { EventDraft, ParsedRow } from './types.js';

const ID_PATTERN = /^[A-Za-z0-9._:-]+$/;

const ACTIVE_STATUSES = new Set(['', 'scheduled', 'confirmed', 'booked']);
const CANCELLED_STATUSES = new Set(['cancelled', 'canceled']);

export interface ReadyRow {
  rowNumber: number;
  appointmentId: string;
  clientName: string;
  eventId: string;
  generatedId: boolean;
  /** Present for scheduled rows. Cancelled rows are identified without a draft. */
  draft: EventDraft | null;
  status: 'scheduled' | 'cancelled';
}

export type PreparedRow =
  | { kind: 'invalid'; rowNumber: number; appointmentId: string; clientName: string; errors: string[] }
  | ({ kind: 'ready' } & ReadyRow);

export function prepareRows(
  rows: ParsedRow[],
  timezone: string,
  createId: (rowNumber: number) => string,
): PreparedRow[] {
  const firstPass = rows.map((row) => classify(row));
  const appointmentDupes = duplicates(firstPass.map((row) => row.appointmentId));
  const eventDupes = duplicates(firstPass.map((row) => row.eventId));
  const takenIds = new Set(firstPass.map((row) => row.appointmentId).filter(Boolean));

  return firstPass.map((row) => {
    const errors = [...row.errors];
    if (row.appointmentId && appointmentDupes.has(row.appointmentId)) {
      errors.push(`Appointment ID "${row.appointmentId}" is used on more than one row.`);
    }
    if (row.eventId && eventDupes.has(row.eventId)) {
      errors.push(`Calendar event ID "${row.eventId}" is used on more than one row.`);
    }
    if (errors.length > 0) {
      return {
        kind: 'invalid' as const,
        rowNumber: row.rowNumber,
        appointmentId: row.appointmentId,
        clientName: row.clientName,
        errors,
      };
    }
    if (row.cancelled) {
      return {
        kind: 'ready' as const,
        rowNumber: row.rowNumber,
        appointmentId: row.appointmentId,
        clientName: row.clientName,
        eventId: row.eventId,
        generatedId: false,
        draft: null,
        status: 'cancelled' as const,
      };
    }

    let appointmentId = row.appointmentId;
    let generatedId = false;
    if (!appointmentId) {
      const assigned = assignId(createId, row.rowNumber, takenIds);
      if (!assigned) {
        return {
          kind: 'invalid' as const,
          rowNumber: row.rowNumber,
          appointmentId: '',
          clientName: row.clientName,
          errors: ['Could not assign a unique appointment id.'],
        };
      }
      appointmentId = assigned;
      generatedId = true;
    }

    const draftResult = buildEventDraft(
      {
        rowNumber: row.rowNumber,
        appointmentId,
        clientName: row.clientName,
        dateIso: row.dateIso ?? '',
        timeHm: row.timeHm ?? '',
        durationMinutes: row.durationMinutes ?? 0,
        location: row.location,
        notes: row.notes,
        status: 'scheduled',
        eventId: row.eventId,
      },
      timezone,
    );
    if (!draftResult.ok) {
      return {
        kind: 'invalid' as const,
        rowNumber: row.rowNumber,
        // Keep a user-supplied id visible. A generated id was not written, so drop it.
        appointmentId: generatedId ? '' : appointmentId,
        clientName: row.clientName,
        errors: draftResult.errors,
      };
    }
    return {
      kind: 'ready' as const,
      rowNumber: row.rowNumber,
      appointmentId,
      clientName: row.clientName,
      eventId: row.eventId,
      generatedId,
      draft: draftResult.draft,
      status: 'scheduled' as const,
    };
  });
}

function assignId(createId: (rowNumber: number) => string, rowNumber: number, taken: Set<string>): string | null {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = createId(rowNumber).trim();
    if (!ID_PATTERN.test(candidate) || candidate.length > MAX_APPOINTMENT_ID_LENGTH || taken.has(candidate)) {
      continue;
    }
    taken.add(candidate);
    return candidate;
  }
  return null;
}

interface Classified {
  rowNumber: number;
  appointmentId: string;
  clientName: string;
  eventId: string;
  location: string;
  notes: string;
  dateIso: string | null;
  timeHm: string | null;
  durationMinutes: number | null;
  cancelled: boolean;
  errors: string[];
}

function classify(row: ParsedRow): Classified {
  const status = row.statusText.trim().toLowerCase();
  const errors: string[] = [];
  const cancelled = CANCELLED_STATUSES.has(status);
  if (!cancelled && !ACTIVE_STATUSES.has(status)) {
    errors.push(`Status "${row.statusText.trim()}" is not recognised. Use scheduled or cancelled.`);
  }
  if (row.appointmentId && !ID_PATTERN.test(row.appointmentId)) {
    errors.push(
      `Appointment ID "${row.appointmentId}" can only use letters, numbers, dots, colons, underscores, and hyphens.`,
    );
  }
  if (row.appointmentId.length > MAX_APPOINTMENT_ID_LENGTH) {
    errors.push(`Appointment ID must be ${MAX_APPOINTMENT_ID_LENGTH} characters or fewer.`);
  }
  if (row.eventId && !/^[A-Za-z0-9_-]{1,1024}$/.test(row.eventId)) {
    errors.push(`Calendar event ID "${row.eventId}" contains characters the Calendar API will not accept.`);
  }

  // A cancelled row only needs a usable id. A bad date must not block
  // deleting the event the sheet already points at.
  if (!cancelled) validateActiveFields(row, errors);

  return {
    rowNumber: row.rowNumber,
    appointmentId: row.appointmentId,
    clientName: row.clientName,
    eventId: row.eventId,
    location: row.location,
    notes: row.notes,
    dateIso: row.dateIso,
    timeHm: row.timeHm,
    durationMinutes: row.durationMinutes,
    cancelled: cancelled && errors.length === 0,
    errors,
  };
}

function validateActiveFields(row: ParsedRow, errors: string[]): void {
  if (!row.clientName) errors.push('Client name is required.');
  else if (row.clientName.length > MAX_CLIENT_LENGTH) {
    errors.push(`Client name must be ${MAX_CLIENT_LENGTH} characters or fewer.`);
  }

  if (!row.dateText) errors.push('Date is required.');
  else if (!row.dateIso) errors.push(`Date "${row.dateText}" is not valid. Use YYYY-MM-DD or DD/MM/YYYY.`);

  if (!row.timeText) errors.push('Start time is required.');
  else if (!row.timeHm) errors.push(`Start time "${row.timeText}" is not valid. Use HH:mm.`);

  if (!row.durationText) errors.push('Duration is required.');
  else if (row.durationMinutes === null) errors.push(`Duration "${row.durationText}" is not a whole number of minutes.`);
  else if (row.durationMinutes <= 0) errors.push('Duration must be greater than 0.');
  else if (row.durationMinutes > MAX_DURATION_MINUTES) {
    errors.push(`Duration cannot exceed ${MAX_DURATION_MINUTES} minutes (7 days).`);
  }

  if (row.location.length > MAX_LOCATION_LENGTH) {
    errors.push(`Location must be ${MAX_LOCATION_LENGTH} characters or fewer.`);
  }
  if (row.notes.length > MAX_NOTES_LENGTH) errors.push(`Notes must be ${MAX_NOTES_LENGTH} characters or fewer.`);
}

function duplicates(values: string[]): Set<string> {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    if (seen.has(value)) dupes.add(value);
    seen.add(value);
  }
  return dupes;
}
