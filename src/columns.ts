/** Column titles the sheet reader understands. Matching is case-insensitive. */

export type FieldKey =
  | 'appointmentId'
  | 'clientName'
  | 'date'
  | 'startTime'
  | 'durationMinutes'
  | 'location'
  | 'notes'
  | 'status'
  | 'eventId'
  | 'syncResult';

export const FIELD_LABELS: Record<FieldKey, string> = {
  appointmentId: 'Appointment ID',
  clientName: 'Client name',
  date: 'Date',
  startTime: 'Start time',
  durationMinutes: 'Duration (minutes)',
  location: 'Location',
  notes: 'Notes',
  status: 'Status',
  eventId: 'Calendar event ID',
  syncResult: 'Sync result',
};

/** Written by the user. Location and notes may be omitted. */
export const REQUIRED_FIELDS: FieldKey[] = [
  'appointmentId',
  'clientName',
  'date',
  'startTime',
  'durationMinutes',
  'status',
  'eventId',
  'syncResult',
];

const ALIASES: Record<string, FieldKey> = {
  'appointment id': 'appointmentId',
  'appointment key': 'appointmentId',
  'client name': 'clientName',
  client: 'clientName',
  name: 'clientName',
  date: 'date',
  'appointment date': 'date',
  'start time': 'startTime',
  start: 'startTime',
  time: 'startTime',
  'duration (minutes)': 'durationMinutes',
  'duration minutes': 'durationMinutes',
  duration: 'durationMinutes',
  minutes: 'durationMinutes',
  location: 'location',
  where: 'location',
  notes: 'notes',
  note: 'notes',
  description: 'notes',
  details: 'notes',
  status: 'status',
  'calendar event id': 'eventId',
  'event id': 'eventId',
  'sync result': 'syncResult',
  'sync status': 'syncResult',
  result: 'syncResult',
};

export interface ColumnMap {
  /** 0-based column index for each recognised field. */
  indexes: Partial<Record<FieldKey, number>>;
  missing: string[];
}

export function normaliseHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

export function mapHeaders(headers: unknown[]): ColumnMap {
  const indexes: Partial<Record<FieldKey, number>> = {};
  headers.forEach((header, index) => {
    const text = header == null ? '' : String(header);
    const field = ALIASES[normaliseHeader(text)];
    if (!field || indexes[field] !== undefined) return;
    indexes[field] = index;
  });
  const missing = REQUIRED_FIELDS.filter((field) => indexes[field] === undefined).map(
    (field) => FIELD_LABELS[field],
  );
  return { indexes, missing };
}

export function expectedHeaderRow(): string[] {
  return [
    FIELD_LABELS.appointmentId,
    FIELD_LABELS.clientName,
    FIELD_LABELS.date,
    FIELD_LABELS.startTime,
    FIELD_LABELS.durationMinutes,
    FIELD_LABELS.location,
    FIELD_LABELS.notes,
    FIELD_LABELS.status,
    FIELD_LABELS.eventId,
    FIELD_LABELS.syncResult,
  ];
}
