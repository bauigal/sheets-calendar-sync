import type { EventDraft, PlanAction, RowEffect, RowOutcome, SyncCounts } from './types.js';
import { formatRange } from './time.js';

export function emptyCounts(): SyncCounts {
  return {
    created: 0,
    updated: 0,
    deleted: 0,
    markedCancelled: 0,
    linked: 0,
    unchanged: 0,
    alreadyCancelled: 0,
    cancelNoop: 0,
    invalid: 0,
    failed: 0,
  };
}

export function countEffects(effects: RowEffect[]): SyncCounts {
  const counts = emptyCounts();
  for (const effect of effects) counts[effect] += 1;
  return counts;
}

export function effectForAction(action: PlanAction): RowEffect {
  switch (action.kind) {
    case 'create':
      return 'created';
    case 'update':
      return 'updated';
    case 'delete':
      return 'deleted';
    case 'mark-cancelled':
      return 'markedCancelled';
    case 'unchanged':
      return action.relink ? 'linked' : 'unchanged';
    case 'already-cancelled':
      return 'alreadyCancelled';
    case 'cancel-noop':
      return 'cancelNoop';
    case 'invalid':
      return 'invalid';
    default: {
      const never: never = action;
      return never;
    }
  }
}

export function describeAction(action: PlanAction): string {
  const id = action.appointmentId || '(no id)';
  const who = action.clientName ? ` | ${action.clientName}` : '';
  const prefix = `Row ${action.rowNumber} | ${id}${who}`;
  switch (action.kind) {
    case 'invalid':
      return `${prefix} | invalid | ${action.errors.join(' ')}`;
    case 'create':
      return `${prefix} | create | ${describeDraft(action.draft)}`;
    case 'update':
      return `${prefix} | update ${action.eventId} | ${action.changes.join(', ')}`;
    case 'unchanged':
      return action.relink
        ? `${prefix} | link existing event ${action.eventId}`
        : `${prefix} | unchanged`;
    case 'delete':
      return `${prefix} | delete ${action.eventId}`;
    case 'mark-cancelled':
      return `${prefix} | mark cancelled ${action.eventId}`;
    case 'already-cancelled':
      return `${prefix} | already cancelled`;
    case 'cancel-noop':
      return `${prefix} | nothing to cancel | ${action.reason}`;
    default: {
      const never: never = action;
      return never;
    }
  }
}

function describeDraft(draft: EventDraft): string {
  const when = formatRange(draft.start.dateTime, draft.end.dateTime, draft.start.timeZone);
  return draft.location ? `${when} | ${draft.location}` : when;
}

export function summarise(counts: SyncCounts, dryRun: boolean): string {
  const parts: string[] = [];
  const add = (count: number, label: string) => {
    if (count > 0) parts.push(`${count} ${label}`);
  };
  if (dryRun) {
    add(counts.created, 'to create');
    add(counts.updated, 'to update');
    add(counts.deleted, 'to delete');
    add(counts.markedCancelled, 'to mark cancelled');
    add(counts.linked, 'to link');
    add(counts.unchanged, 'unchanged');
    add(counts.alreadyCancelled, 'already cancelled');
    add(counts.cancelNoop, 'with nothing to cancel');
    add(counts.invalid, 'invalid');
    return `Dry run — ${parts.length ? parts.join(', ') : 'nothing to do'}. No changes written.`;
  }
  add(counts.created, 'created');
  add(counts.updated, 'updated');
  add(counts.deleted, 'deleted');
  add(counts.markedCancelled, 'marked cancelled');
  add(counts.linked, 'linked');
  add(counts.unchanged, 'unchanged');
  add(counts.alreadyCancelled, 'already cancelled');
  add(counts.cancelNoop, 'with nothing to cancel');
  add(counts.invalid, 'invalid');
  add(counts.failed, 'failed');
  return `Sync — ${parts.length ? parts.join(', ') : 'nothing to do'}.`;
}

export function syncResultFor(effect: RowEffect, errors: string[] = [], failure = ''): string {
  switch (effect) {
    case 'created':
      return 'Created';
    case 'updated':
      return 'Updated';
    case 'deleted':
      return 'Deleted';
    case 'markedCancelled':
      return 'Marked cancelled';
    case 'linked':
      return 'Linked existing event';
    case 'unchanged':
      return 'Unchanged';
    case 'alreadyCancelled':
      return 'Already cancelled';
    case 'cancelNoop':
      return 'No event to cancel';
    case 'invalid':
      return `Error: ${errors.join(' ')}`;
    case 'failed':
      return `Failed: ${failure}`;
    default: {
      const never: never = effect;
      return never;
    }
  }
}

/** Font colours for the Sync result column. Dry runs never write them. */
export function syncResultColor(syncResult: string): string {
  if (syncResult.startsWith('Error:') || syncResult.startsWith('Failed:')) return '#9b2c2c';
  if (
    syncResult === 'Unchanged' ||
    syncResult === 'Already cancelled' ||
    syncResult === 'No event to cancel' ||
    syncResult === 'Linked existing event'
  ) {
    return '#4a5568';
  }
  return '#176b45';
}

export function outcomeFromAction(action: PlanAction): RowOutcome {
  const effect = effectForAction(action);
  const errors = action.kind === 'invalid' ? action.errors : [];
  const eventId = eventIdWrite(action);
  return {
    rowNumber: action.rowNumber,
    appointmentId: action.appointmentId,
    clientName: action.clientName,
    ...(eventId === undefined ? {} : { eventId }),
    syncResult: syncResultFor(effect, errors),
    effect,
    log: describeAction(action),
  };
}

function eventIdWrite(action: PlanAction): string | null | undefined {
  switch (action.kind) {
    case 'create':
      return undefined;
    case 'update':
    case 'unchanged':
    case 'mark-cancelled':
    case 'already-cancelled':
      return action.relink ? action.eventId : undefined;
    case 'delete':
      return null;
    case 'cancel-noop':
      return action.clearEventId ? null : undefined;
    case 'invalid':
      return undefined;
    default: {
      const never: never = action;
      return never;
    }
  }
}
