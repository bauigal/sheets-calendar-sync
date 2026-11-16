# Sheets Calendar Sync

Sync appointment rows in a Google Sheet to Google Calendar. Run it again and it updates the same events instead of creating duplicates. Cancelled rows delete the event, or mark it cancelled, and a dry run prints the plan without changing anything.

The names, places, and times in this repo are fictional.

## Try the logic locally

You can run the planner without a Google account. Node 20 or newer:

```bash
npm install
npm test
npm run demo
```

`npm run demo` reads [`sample-data/appointments.csv`](sample-data/appointments.csv) and applies it to an in-memory calendar:

```text
1. Dry run
DRY RUN Row 2 | APT-1001 | Avery Quinn | create | 2026-04-07 09:30–10:30 Europe/London | 14 Wren Lane, London
DRY RUN Row 9 | APT-1008 | Jamie Patel | create | 2026-04-08 09:00–11:00 Europe/London | Warehouse B
DRY RUN Row 11 | APT-1010 | Priya Shah | create | 2026-04-13 23:30–2026-04-14 01:00 Europe/London | Phone
DRY RUN Row 6 | APT-1005 | invalid | Client name is required.
DRY RUN Row 15 | (no id) | Noah Edwards | nothing to cancel | No calendar event is linked to this row.
Dry run — 8 to create, 3 with nothing to cancel, 4 invalid. No changes written.

2. Sync against an empty calendar
Sync — 8 created, 3 with nothing to cancel, 4 invalid.

3. Sync again without edits
Sync — 8 unchanged, 3 with nothing to cancel, 4 invalid.
   New calendar writes this pass: none

4. Move Avery Quinn to 10:00 and sync again
Row 2 | APT-1001 | Avery Quinn | update evt-1 | start, end
```

`08/04/2026` is 8 April, because the default zone is `Europe/London` and slash dates are day-first when both readings are possible. `04/13/2026` is 13 April, because the day-first reading is impossible.

## What a sync does

1. Read the appointment tab (and an optional Config tab).
2. Check each row. Broken active rows are flagged in **Sync result** and skipped.
3. Match each good row to a calendar event (see below).
4. Create, update, delete, or leave the event alone.
5. Write the calendar event id and a short result back to the row.

A **dry run** reads the calendar and shows the same plan in an alert and in the Apps Script execution log. It does not create events, and it does not change cells.

### Matching an event

The sheet is the source of truth.

- If **Calendar event ID** is filled in and that event still exists, the row updates that event.
- If the id is empty or the event is gone, the script looks for a private calendar property, `appointmentKey`, equal to **Appointment ID**. That is how a rerun finds an event when a previous run created it and then failed before saving the id.
- New appointment ids are written to the sheet *before* the calendar event is created, so that recovery key exists even if the following write fails.
- The same appointment id or event id on two rows is an error. Neither row is synced until that is fixed.

The event title is the client name. The description keeps the notes, the appointment id, and a line saying the event was synced from the sheet. Duration is real elapsed time: on 29 March 2026, 00:30 plus 60 minutes ends at 02:30 in London, because 01:30 does not exist that morning.

### Cancelled rows

| Cancel mode | What happens |
| --- | --- |
| `delete` (default) | The event is removed and the event id cell is cleared. |
| `mark` | The event stays, with status `cancelled`, and the id is kept so a later `scheduled` row can reopen it. |

A cancelled row is processed even when the date or client name is messy, as long as the ids are usable. If nothing is linked, the result is `No event to cancel`.

### Status values

| Cell | Meaning |
| --- | --- |
| empty, `scheduled`, `confirmed`, `booked` | Active. Create or update the event. |
| `cancelled`, `canceled` | Cancel, using the mode above. |
| anything else | The row is flagged and left alone. |

**Sync result** is the column the script writes (`Created`, `Updated`, `Unchanged`, `Deleted`, `Marked cancelled`, `Linked existing event`, `Already cancelled`, `No event to cancel`, `Error: …`, `Failed: …`). Errors are coloured red, successful writes green, and quiet results grey.

## Sheet layout

Put this header on row 1 of a tab named `Appointments` (or wherever Config says the header is). Location and Notes may be omitted. The other columns are required.

| Column | Required | Notes |
| --- | --- | --- |
| Appointment ID | Column yes, cell may be blank | Letters, numbers, `.`, `:`, `_`, `-`. A blank cell on an active row is filled in on a real sync. |
| Client name | Yes for active rows | Becomes the event title. |
| Date | Yes for active rows | `YYYY-MM-DD`, `DD/MM/YYYY`, `8 April 2026`, or a real date cell. Years 1900–2100. |
| Start time | Yes for active rows | `HH:mm` or `h:mm AM/PM`. |
| Duration (minutes) | Yes for active rows | Whole minutes, from 1 to 10080 (7 days). |
| Location | No | |
| Notes | No | |
| Status | Column required | See the table above. |
| Calendar event ID | Column required | Written by the script. Paste an existing id only when you mean to adopt that event. |
| Sync result | Column required | Written by the script. |

[`sample-data/appointments.csv`](sample-data/appointments.csv) is a full example, including bad rows. Dates and times typed as text work, and so do native Sheets date and time cells.

Times that fall in a daylight-saving gap, or that happen twice on a fall-back morning, are rejected. Pick a nearby unambiguous time. Europe/London skips 01:00–01:59 on 29 March 2026 and repeats 01:00–01:59 on 25 October 2026.

## Configuration

Defaults live in `src/config.ts`:

```ts
export const DEFAULT_CONFIG = {
  calendarId: 'primary',
  sheetName: 'Appointments',
  configSheetName: 'Config',
  timezone: 'Europe/London',
  headerRow: 1,
  cancelMode: 'delete',
  maxRows: 500,
};
```

A tab named `Config` overrides any non-blank value. [`sample-data/config.csv`](sample-data/config.csv):

| Key | Value |
| --- | --- |
| Calendar ID | `primary`, or the id from Calendar settings → Integrate calendar |
| Sheet name | Appointments |
| Time zone | Europe/London |
| Header row | 1 |
| Cancel mode | `delete` or `mark` |
| Max rows | 500 |

Unknown keys are reported and ignored. The appointment tab and the config tab have to be different sheets. `primary` means the Google account’s main calendar. The account that runs the script needs permission to edit whatever calendar id you set.

## Set up in Google Sheets

These steps need a person signed in to Google. The script cannot grant that access for you.

1. Create a spreadsheet and a calendar (or use your primary calendar).
2. Rename a tab to `Appointments`. Paste [`sample-data/appointments.csv`](sample-data/appointments.csv) into it, including the header, starting at A1. File → Import works too. Keep or restore the tab name `Appointments`.
3. Add a tab named `Config` and paste [`sample-data/config.csv`](sample-data/config.csv). Put your calendar id in that tab if you are not using `primary`.
4. Deploy the script (next section), then reload the spreadsheet.
5. Use **Calendar Sync → Dry run**, then **Calendar Sync → Sync now**.

The first **Sync now** opens Google’s permission screen. Approve it with the account that should own the events. The screen asks for access to this spreadsheet, to Google Calendar, and to install triggers. That approval has to be done by a person in the browser.

## Deploy with clasp

The Apps Script project has to be **bound to the spreadsheet** (created from Extensions → Apps Script). A standalone script cannot see “the current spreadsheet” with the scopes this project uses.

```bash
npm install
npm test
npm run build
npm install -g @google/clasp
clasp login
```

In the sheet: **Extensions → Apps Script → Project settings**, and copy the Script ID.

```bash
cp .clasp.json.example .clasp.json
```

Put the Script ID into `.clasp.json`. `rootDir` stays `dist`. That folder is produced by `npm run build` and contains `Code.js` plus `appsscript.json`. Do not point clasp at the repository root.

```bash
clasp push
```

`appsscript.json` turns on the Calendar advanced service (v3) and sets the project time zone to `Europe/London`. If the Apps Script editor asks you to confirm that service, accept it. Reload the spreadsheet. The **Calendar Sync** menu comes from `onOpen`.

`.clasp.json` is gitignored because the Script ID belongs to your account.

After you change TypeScript, run `npm run build` again before the next `clasp push`.

## Install the hourly trigger

**Calendar Sync → Install hourly trigger** creates one time-driven trigger that calls `syncNow` every hour. It runs as the user who installed it, including when the sheet is closed. There is no dialog on that path. Results are written to **Sync result**, and the full log is under **Extensions → Apps Script → Executions**.

Installing a trigger asks for permission again. That approval is also a manual step.

The installer deletes any previous `syncNow` trigger first, so running it twice does not stack hourly jobs. **Remove sync triggers** deletes only those. Other triggers in the same project are left alone.

To run daily instead, change `.everyHours(1)` in `src/gas/entry.ts`, rebuild, and push. Then use the menu item again so the old hourly trigger is replaced.

## Development

Pure logic is separate from Google APIs. Tests call the same `runSync` the menu calls, with an in-memory calendar.

```text
src/config.ts            defaults and the Config tab
src/parse.ts             sheet values to rows
src/validation.ts        required fields, duplicates, generated ids
src/mapping.ts           row to a calendar event
src/time.ts              dates, times, daylight saving
src/diff.ts              create / update / delete / link plan
src/execute.ts           apply a plan through a calendar port
src/runner.ts            wire a run together, including dry run
src/gas/entry.ts         menu, trigger, and the live adapters
sample-data/             fictional appointments and config
```

```bash
npm test          # Vitest
npm run typecheck
npm run build     # dist/Code.js for clasp
npm run demo
```

Apps Script only treats top-level `function onOpen()` declarations as simple triggers. The build bundles the TypeScript into an IIFE and appends thin wrappers that call `globalThis.__sheetsCalendarSync`.

## Limitations

- One calendar for the whole sheet, and one event per row. No guests, no email invites, no recurrence. Writes use `sendUpdates: 'none'`.
- The sheet wins. An edit made only in Calendar is overwritten on the next sync.
- An all-day event whose id is pasted into the sheet is replaced by a timed event on the next sync.
- Designed for a few hundred rows (`maxRows` defaults to 500), not a full organisation calendar. Each unmatched appointment id costs a Calendar lookup.
- The script is container-bound. `spreadsheets.currentonly` cannot read other spreadsheets.
- Appointment ids are also Calendar private-property queries, so they cannot contain spaces.
- Ambiguous or skipped daylight-saving times are rejected rather than guessed.
- A dry run inside Google still reads the calendar. It does not fill **Sync result**; run **Sync now** to flag bad rows in the sheet.
- Apps Script executions are limited (six minutes on a consumer account). A failed row is recorded and the rest of the plan continues. A failed whole run, such as a missing tab or a bad time zone, changes nothing.

## License

[MIT](LICENSE).
