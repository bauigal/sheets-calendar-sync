/// <reference types="google-apps-script" />

import { errorMessage } from '../execute.js';
import type { CalendarEventSnapshot, CalendarPort, EventDraft } from '../types.js';

/**
 * Minimal shape of the Advanced Calendar service. The Apps Script type
 * package models this service loosely, and the adapter only needs these calls.
 */
interface CalendarAdvanced {
  Events: {
    get(calendarId: string, eventId: string): GasEvent;
    list(calendarId: string, options: Record<string, unknown>): GasEventList;
    insert(resource: Record<string, unknown>, calendarId: string, options?: Record<string, unknown>): GasEvent;
    patch(
      resource: Record<string, unknown>,
      calendarId: string,
      eventId: string,
      options?: Record<string, unknown>,
    ): GasEvent;
    remove(calendarId: string, eventId: string, options?: Record<string, unknown>): void;
  };
}

interface GasEvent {
  id?: string;
  summary?: string;
  description?: string;
  location?: string;
  status?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  extendedProperties?: { private?: Record<string, string> };
}

interface GasEventList {
  items?: GasEvent[];
  nextPageToken?: string;
}

const NO_GUEST_EMAIL = { sendUpdates: 'none' };

export function createCalendarPort(calendarId: string): CalendarPort {
  return {
    loadByIds(ids) {
      const api = calendarApi();
      const found: CalendarEventSnapshot[] = [];
      for (const id of ids) {
        try {
          const event = api.Events.get(calendarId, id);
          const snapshot = toSnapshot(event);
          if (snapshot) found.push(snapshot);
        } catch (error) {
          if (isNotFound(error)) continue;
          throw new Error(`Could not read event ${id}: ${errorMessage(error)}`);
        }
      }
      return found;
    },

    loadByKeys(keys) {
      const api = calendarApi();
      const found: CalendarEventSnapshot[] = [];
      for (const key of keys) {
        let pageToken = '';
        // A key should match one event. Follow a few pages so a duplicate
        // is visible to the planner instead of hidden behind maxResults.
        for (let page = 0; page < 5; page += 1) {
          const options: Record<string, unknown> = {
            privateExtendedProperty: [`appointmentKey=${key}`],
            showDeleted: true,
            singleEvents: true,
            maxResults: 20,
          };
          if (pageToken) options.pageToken = pageToken;
          const listed = api.Events.list(calendarId, options);
          for (const item of listed.items ?? []) {
            const snapshot = toSnapshot(item);
            if (snapshot) found.push(snapshot);
          }
          pageToken = listed.nextPageToken ?? '';
          if (!pageToken) break;
        }
      }
      return found;
    },

    createEvent(draft) {
      const created = calendarApi().Events.insert(resourceFromDraft(draft), calendarId, NO_GUEST_EMAIL);
      if (!created.id) throw new Error('Calendar did not return an event id.');
      return created.id;
    },

    updateEvent(eventId, draft) {
      calendarApi().Events.patch(resourceFromDraft(draft), calendarId, eventId, NO_GUEST_EMAIL);
    },

    deleteEvent(eventId) {
      calendarApi().Events.remove(calendarId, eventId, NO_GUEST_EMAIL);
    },

    cancelEvent(eventId) {
      calendarApi().Events.patch({ status: 'cancelled' }, calendarId, eventId, NO_GUEST_EMAIL);
    },
  };
}

function calendarApi(): CalendarAdvanced {
  const api = (globalThis as { Calendar?: CalendarAdvanced }).Calendar;
  if (!api?.Events) {
    throw new Error('The Google Calendar advanced service is not enabled. Push the manifest with clasp, then reload the script.');
  }
  return api;
}

function resourceFromDraft(draft: EventDraft): Record<string, unknown> {
  return {
    summary: draft.summary,
    description: draft.description,
    location: draft.location,
    status: 'confirmed',
    start: { dateTime: draft.start.dateTime, timeZone: draft.start.timeZone },
    end: { dateTime: draft.end.dateTime, timeZone: draft.end.timeZone },
    extendedProperties: { private: { appointmentKey: draft.appointmentKey } },
  };
}

function toSnapshot(event: GasEvent | null | undefined): CalendarEventSnapshot | null {
  if (!event?.id) return null;
  const status = event.status === 'cancelled' ? 'cancelled' : event.status === 'tentative' ? 'tentative' : 'confirmed';
  return {
    id: event.id,
    summary: event.summary ?? '',
    description: event.description ?? '',
    location: event.location ?? '',
    // All-day events expose `date` instead of `dateTime`. Leaving dateTime
    // empty makes the diff replace them with a timed event on the next sync.
    start: { dateTime: event.start?.dateTime ?? '', timeZone: event.start?.timeZone ?? '' },
    end: { dateTime: event.end?.dateTime ?? '', timeZone: event.end?.timeZone ?? '' },
    appointmentKey: event.extendedProperties?.private?.appointmentKey ?? '',
    status,
  };
}

function isNotFound(error: unknown): boolean {
  const message = errorMessage(error);
  return /\b404\b|not found/i.test(message);
}
