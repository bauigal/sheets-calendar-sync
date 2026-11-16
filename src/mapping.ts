import { MAX_DURATION_MINUTES } from './limits.js';
import type { EventDraft, ValidRow } from './types.js';
import { inspectWallTime } from './time.js';

export type DraftResult = { ok: true; draft: EventDraft } | { ok: false; errors: string[] };

/**
 * Duration is real elapsed time, not "add this many minutes to the clock".
 * On a spring-forward morning, 00:30 plus 60 minutes ends at 02:30 because
 * 01:30 does not exist. Luxon `plus` does that arithmetic on the instant.
 */
export function buildEventDraft(row: ValidRow, timezone: string): DraftResult {
  const [year, month, day] = row.dateIso.split('-').map(Number);
  const [hour, minute] = row.timeHm.split(':').map(Number);
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined
  ) {
    return { ok: false, errors: ['Start time could not be read.'] };
  }

  const wall = inspectWallTime(timezone, { year, month, day, hour, minute });
  if (wall.kind === 'invalid-zone') {
    return { ok: false, errors: [`Time zone "${timezone}" is not a valid IANA time zone.`] };
  }
  if (wall.kind === 'gap') {
    return {
      ok: false,
      errors: [
        `Start time ${row.dateIso} ${row.timeHm} does not exist in ${timezone} (daylight saving gap).`,
      ],
    };
  }
  if (wall.kind === 'overlap') {
    return {
      ok: false,
      errors: [
        `Start time ${row.dateIso} ${row.timeHm} happens twice in ${timezone} (daylight saving overlap). Pick a nearby unambiguous time.`,
      ],
    };
  }
  if (!Number.isInteger(row.durationMinutes) || row.durationMinutes < 1 || row.durationMinutes > MAX_DURATION_MINUTES) {
    return { ok: false, errors: ['Duration is out of range.'] };
  }

  const end = wall.start.plus({ minutes: row.durationMinutes });
  const stamp = "yyyy-MM-dd'T'HH:mm:ssZZ";
  return {
    ok: true,
    draft: {
      summary: row.clientName,
      description: buildDescription(row.notes, row.appointmentId),
      location: row.location,
      start: { dateTime: wall.start.toFormat(stamp), timeZone: timezone },
      end: { dateTime: end.toFormat(stamp), timeZone: timezone },
      appointmentKey: row.appointmentId,
    },
  };
}

export function buildDescription(notes: string, appointmentId: string): string {
  const footer = ['—', `Appointment ID: ${appointmentId}`, 'Synced from the appointments sheet.'].join('\n');
  const body = notes.trim();
  return body ? `${body}\n\n${footer}` : footer;
}
