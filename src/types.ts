/** Shared shapes. These types do not depend on Apps Script. */

export type CancelMode = 'delete' | 'mark';

export interface SyncConfig {
  /** Calendar to write. `primary` is the account's main calendar. */
  calendarId: string;
  /** Tab that holds appointment rows. */
  sheetName: string;
  /** Optional tab of key/value overrides. Not read from itself. */
  configSheetName: string;
  /** IANA zone used to interpret date and time cells. */
  timezone: string;
  /** 1-based row that contains column titles. */
  headerRow: number;
  /**
   * `delete` removes the calendar event.
   * `mark` sets its status to cancelled and keeps the id for a later reopen.
   */
  cancelMode: CancelMode;
  /** Safety stop so a huge sheet cannot run until the Apps Script time limit. */
  maxRows: number;
}

export type AppointmentStatus = 'scheduled' | 'cancelled';

export interface ParsedRow {
  rowNumber: number;
  appointmentId: string;
  clientName: string;
  /** Original date cell text, or a formatted date when the cell was a Date. */
  dateText: string;
  dateIso: string | null;
  timeText: string;
  timeHm: string | null;
  durationText: string;
  durationMinutes: number | null;
  location: string;
  notes: string;
  statusText: string;
  eventId: string;
}

export interface ValidRow {
  rowNumber: number;
  appointmentId: string;
  clientName: string;
  dateIso: string;
  timeHm: string;
  durationMinutes: number;
  location: string;
  notes: string;
  status: AppointmentStatus;
  eventId: string;
}

/** Local start/end plus the fields we write to Calendar. */
export interface EventDraft {
  summary: string;
  description: string;
  location: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  appointmentKey: string;
}

export interface CalendarEventSnapshot {
  id: string;
  summary: string;
  description: string;
  location: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  appointmentKey: string;
  status: 'confirmed' | 'tentative' | 'cancelled';
}

export interface EventIndex {
  byId: Map<string, CalendarEventSnapshot>;
  /** Every event that carries this private appointment key, including cancelled ones. */
  byKey: Map<string, CalendarEventSnapshot[]>;
}

interface ActionBase {
  rowNumber: number;
  appointmentId: string;
  clientName: string;
}

export type PlanAction =
  | (ActionBase & { kind: 'invalid'; errors: string[] })
  | (ActionBase & { kind: 'create'; draft: EventDraft })
  | (ActionBase & {
      kind: 'update';
      eventId: string;
      draft: EventDraft;
      changes: string[];
      relink: boolean;
    })
  | (ActionBase & { kind: 'unchanged'; eventId: string; relink: boolean })
  | (ActionBase & { kind: 'delete'; eventId: string })
  | (ActionBase & { kind: 'mark-cancelled'; eventId: string; relink: boolean })
  | (ActionBase & { kind: 'already-cancelled'; eventId: string; relink: boolean })
  | (ActionBase & { kind: 'cancel-noop'; clearEventId: boolean; reason: string });

export type RowEffect =
  | 'created'
  | 'updated'
  | 'deleted'
  | 'markedCancelled'
  | 'linked'
  | 'unchanged'
  | 'alreadyCancelled'
  | 'cancelNoop'
  | 'invalid'
  | 'failed';

export interface RowOutcome {
  rowNumber: number;
  appointmentId: string;
  clientName: string;
  /**
   * Undefined leaves the event id cell alone.
   * Null clears it.
   * A string writes that id.
   */
  eventId?: string | null;
  syncResult: string;
  effect: RowEffect;
  log: string;
}

export interface SyncCounts {
  created: number;
  updated: number;
  deleted: number;
  markedCancelled: number;
  linked: number;
  unchanged: number;
  alreadyCancelled: number;
  cancelNoop: number;
  invalid: number;
  failed: number;
}

export interface SyncReport {
  ok: boolean;
  dryRun: boolean;
  error?: string;
  log: string[];
  counts: SyncCounts;
  outcomes: RowOutcome[];
}

/** Reads and writes used by the runner. Apps Script and the in-memory demo both implement this. */
export interface CalendarPort {
  loadByIds(ids: string[]): CalendarEventSnapshot[];
  loadByKeys(keys: string[]): CalendarEventSnapshot[];
  createEvent(draft: EventDraft): string;
  updateEvent(eventId: string, draft: EventDraft): void;
  deleteEvent(eventId: string): void;
  cancelEvent(eventId: string): void;
}
