import { MAX_APPOINTMENT_ID_LENGTH } from './limits.js';

/**
 * Appointment ids are also Calendar private-property keys, so the alphabet
 * stays inside what the extended-property query accepts without escaping.
 */
export function makeAppointmentId(rowNumber: number, nowMs: number, entropy: string): string {
  const noise = entropy.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6) || 'x';
  const id = `APT-${rowNumber}-${nowMs.toString(36)}${noise}`;
  return id.slice(0, MAX_APPOINTMENT_ID_LENGTH);
}
