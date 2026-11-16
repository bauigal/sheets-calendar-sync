import type { CalendarEventSnapshot, CalendarPort, EventDraft } from './types.js';

export interface MemoryCalendar extends CalendarPort {
  events: Map<string, CalendarEventSnapshot>;
  calls: string[];
}

/** Calendar stand-in for tests and `npm run demo`. Nothing here talks to Google. */
export function createMemoryCalendar(seed: CalendarEventSnapshot[] = []): MemoryCalendar {
  const events = new Map<string, CalendarEventSnapshot>();
  for (const event of seed) events.set(event.id, clone(event));
  const calls: string[] = [];
  let sequence = events.size;

  return {
    events,
    calls,
    loadByIds(ids) {
      return ids.flatMap((id) => {
        const event = events.get(id);
        return event ? [clone(event)] : [];
      });
    },
    loadByKeys(keys) {
      const wanted = new Set(keys);
      return [...events.values()].filter((event) => wanted.has(event.appointmentKey)).map(clone);
    },
    createEvent(draft) {
      sequence += 1;
      const id = `evt-${sequence}`;
      events.set(id, snapshotFromDraft(id, draft, 'confirmed'));
      calls.push(`create:${id}`);
      return id;
    },
    updateEvent(eventId, draft) {
      if (!events.has(eventId)) throw new Error(`Event ${eventId} was not found.`);
      events.set(eventId, snapshotFromDraft(eventId, draft, 'confirmed'));
      calls.push(`update:${eventId}`);
    },
    deleteEvent(eventId) {
      if (!events.has(eventId)) throw new Error(`Event ${eventId} was not found.`);
      events.delete(eventId);
      calls.push(`delete:${eventId}`);
    },
    cancelEvent(eventId) {
      const event = events.get(eventId);
      if (!event) throw new Error(`Event ${eventId} was not found.`);
      events.set(eventId, { ...event, status: 'cancelled' });
      calls.push(`cancel:${eventId}`);
    },
  };
}

function snapshotFromDraft(
  id: string,
  draft: EventDraft,
  status: CalendarEventSnapshot['status'],
): CalendarEventSnapshot {
  return {
    id,
    summary: draft.summary,
    description: draft.description,
    location: draft.location,
    start: { ...draft.start },
    end: { ...draft.end },
    appointmentKey: draft.appointmentKey,
    status,
  };
}

function clone(event: CalendarEventSnapshot): CalendarEventSnapshot {
  return {
    ...event,
    start: { ...event.start },
    end: { ...event.end },
  };
}
