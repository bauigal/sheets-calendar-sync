import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG, parseCsv, runSync } from '../src/index.js';
import { createMemoryCalendar } from '../src/memoryCalendar.js';
import { applyAppointmentIds, applyOutcomes } from '../src/sheetEdit.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const csv = readFileSync(join(root, 'sample-data', 'appointments.csv'), 'utf8');
const matrix = parseCsv(csv).map((row) => [...row]);
const calendar = createMemoryCalendar();

function createId(rowNumber: number): string {
  return `APT-R${rowNumber}`;
}

console.log('Sheets Calendar Sync — local demo');
console.log('This uses the sample CSV and an in-memory calendar. No Google account is involved.\n');

const dryRun = runSync({
  matrix,
  config: DEFAULT_CONFIG,
  dryRun: true,
  calendar,
  createId,
  writeAppointmentIds: () => {
    throw new Error('Dry run tried to write appointment ids.');
  },
  writeOutcomes: () => {
    throw new Error('Dry run tried to write the sheet.');
  },
});

console.log('1. Dry run');
console.log(dryRun.log.join('\n'));
console.log('');

const first = runSync({
  matrix,
  config: DEFAULT_CONFIG,
  dryRun: false,
  calendar,
  createId,
  writeAppointmentIds: (updates) => applyAppointmentIds(matrix, DEFAULT_CONFIG.headerRow, updates),
  writeOutcomes: (outcomes) => applyOutcomes(matrix, DEFAULT_CONFIG.headerRow, outcomes),
});

console.log('2. Sync against an empty calendar');
console.log(first.log[first.log.length - 1]);
console.log(`   Calendar events: ${calendar.events.size}`);
console.log('');

const firstCreates = calendar.calls.length;

const second = runSync({
  matrix,
  config: DEFAULT_CONFIG,
  dryRun: false,
  calendar,
  createId,
  writeAppointmentIds: (updates) => applyAppointmentIds(matrix, DEFAULT_CONFIG.headerRow, updates),
  writeOutcomes: (outcomes) => applyOutcomes(matrix, DEFAULT_CONFIG.headerRow, outcomes),
});

console.log('3. Sync again without edits');
console.log(second.log[second.log.length - 1]);
console.log(`   New calendar writes this pass: ${calendar.calls.length - firstCreates === 0 ? 'none' : calendar.calls.slice(firstCreates).join(', ')}`);
console.log('');

const nameColumn = 1;
const avery = matrix.find((row) => row[nameColumn] === 'Avery Quinn');
if (!avery) throw new Error('Sample row Avery Quinn is missing.');
avery[3] = '10:00';

calendar.calls.length = 0;
const third = runSync({
  matrix,
  config: DEFAULT_CONFIG,
  dryRun: false,
  calendar,
  createId,
  writeAppointmentIds: (updates) => applyAppointmentIds(matrix, DEFAULT_CONFIG.headerRow, updates),
  writeOutcomes: (outcomes) => applyOutcomes(matrix, DEFAULT_CONFIG.headerRow, outcomes),
});

console.log('4. Move Avery Quinn to 10:00 and sync again');
console.log(third.log.filter((line) => line.includes('Avery') || line.startsWith('Sync')).join('\n'));
