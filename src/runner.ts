import { buildPlan, indexEvents } from './diff.js';
import { executePlan } from './execute.js';
import { parseSheetMatrix } from './parse.js';
import { countEffects, describeAction, effectForAction, emptyCounts, summarise } from './report.js';
import type { CalendarPort, EventIndex, RowOutcome, SyncConfig, SyncReport } from './types.js';
import { prepareRows, type PreparedRow } from './validation.js';

export interface IdUpdate {
  rowNumber: number;
  appointmentId: string;
}

export interface RunSyncInput {
  matrix: unknown[][];
  config: SyncConfig;
  dryRun: boolean;
  calendar: CalendarPort;
  createId: (rowNumber: number) => string;
  /**
   * Persist brand-new appointment ids before any calendar write.
   * If creating the event succeeds and saving its id fails, the next run
   * can still find that event by this key instead of creating a second one.
   */
  writeAppointmentIds: (updates: IdUpdate[]) => void;
  writeOutcomes: (outcomes: RowOutcome[]) => void;
  log?: (line: string) => void;
}

export function runSync(input: RunSyncInput): SyncReport {
  const emit = (lines: string[]): string[] => {
    for (const line of lines) input.log?.(line);
    return lines;
  };

  const parsed = parseSheetMatrix(input.matrix, input.config);
  if (!parsed.ok) {
    const log = emit([parsed.error]);
    return { ok: false, dryRun: input.dryRun, error: parsed.error, log, counts: emptyCounts(), outcomes: [] };
  }

  const prepared = prepareRows(parsed.rows, input.config.timezone, input.createId);
  const newIds = generatedIds(prepared);
  // Reads below are allowed in a dry run. Writes are not.
  if (!input.dryRun && newIds.length > 0) input.writeAppointmentIds(newIds);

  const loadedById = input.calendar.loadByIds(eventIds(prepared));
  let index = indexEvents(loadedById);
  const keys = keysToFetch(prepared, index);
  if (keys.length > 0) {
    index = indexEvents([...index.byId.values(), ...input.calendar.loadByKeys(keys)]);
  }

  const actions = buildPlan(prepared, index, input.config);
  if (input.dryRun) {
    const lines = actions.map((action) => `DRY RUN ${describeAction(action)}`);
    const counts = countEffects(actions.map(effectForAction));
    lines.push(summarise(counts, true));
    return { ok: true, dryRun: true, log: emit(lines), counts, outcomes: [] };
  }

  const execution = executePlan(actions, input.calendar);
  input.writeOutcomes(execution.outcomes);
  const counts = countEffects(execution.outcomes.map((outcome) => outcome.effect));
  const log = emit([...execution.log, summarise(counts, false)]);
  return { ok: true, dryRun: false, log, counts, outcomes: execution.outcomes };
}

function generatedIds(rows: PreparedRow[]): IdUpdate[] {
  return rows.flatMap((row) =>
    row.kind === 'ready' && row.generatedId ? [{ rowNumber: row.rowNumber, appointmentId: row.appointmentId }] : [],
  );
}

function eventIds(rows: PreparedRow[]): string[] {
  return [...new Set(rows.flatMap((row) => (row.kind === 'ready' && row.eventId ? [row.eventId] : [])))];
}

function keysToFetch(rows: PreparedRow[], index: EventIndex): string[] {
  return [
    ...new Set(
      rows.flatMap((row) => {
        if (row.kind !== 'ready' || !row.appointmentId || row.generatedId) return [];
        if (row.eventId && index.byId.has(row.eventId)) return [];
        return [row.appointmentId];
      }),
    ),
  ];
}
