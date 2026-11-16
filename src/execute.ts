import type { CalendarPort, PlanAction, RowOutcome } from './types.js';
import { describeAction, outcomeFromAction, syncResultFor } from './report.js';

export interface Execution {
  outcomes: RowOutcome[];
  log: string[];
}

/**
 * Apply one action at a time. A failure is written onto that row and the
 * rest of the plan still runs, so one bad event does not abandon the sheet.
 */
export function executePlan(actions: PlanAction[], calendar: CalendarPort): Execution {
  const outcomes: RowOutcome[] = [];
  const log: string[] = [];
  for (const action of actions) {
    const outcome = applyAction(action, calendar);
    outcomes.push(outcome);
    log.push(outcome.log);
  }
  return { outcomes, log };
}

function applyAction(action: PlanAction, calendar: CalendarPort): RowOutcome {
  const planned = outcomeFromAction(action);
  try {
    switch (action.kind) {
      case 'create': {
        const id = calendar.createEvent(action.draft);
        return { ...planned, eventId: id, log: `${describeAction(action)} | event ${id}` };
      }
      case 'update':
        calendar.updateEvent(action.eventId, action.draft);
        return planned;
      case 'delete':
        calendar.deleteEvent(action.eventId);
        return planned;
      case 'mark-cancelled':
        calendar.cancelEvent(action.eventId);
        return planned;
      case 'unchanged':
      case 'already-cancelled':
      case 'cancel-noop':
      case 'invalid':
        return planned;
      default: {
        const never: never = action;
        return never;
      }
    }
  } catch (error) {
    const message = errorMessage(error);
    return {
      rowNumber: action.rowNumber,
      appointmentId: action.appointmentId,
      clientName: action.clientName,
      ...(action.kind === 'update' || action.kind === 'mark-cancelled' || action.kind === 'unchanged' || action.kind === 'already-cancelled'
        ? action.relink
          ? { eventId: action.eventId }
          : {}
        : {}),
      syncResult: syncResultFor('failed', [], message),
      effect: 'failed',
      log: `${describeAction(action)} | failed | ${message}`,
    };
  }
}

export function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const flat = message.replace(/\s+/g, ' ').trim();
  return flat || 'Unknown error';
}
