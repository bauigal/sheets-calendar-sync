/// <reference types="google-apps-script" />

import { ConfigError, DEFAULT_CONFIG, parseConfigSheet, resolveConfig } from '../config.js';
import { makeAppointmentId } from '../ids.js';
import { runSync, type RunSyncInput } from '../runner.js';
import type { SyncReport } from '../types.js';
import { SYNC_HANDLER, triggerIdsForHandlers } from '../triggers.js';
import { createCalendarPort } from './calendarAdapter.js';
import { readOptionalMatrix, readSheetMatrix, writeAppointmentIdCells, writeOutcomeCells } from './sheetAdapter.js';

/**
 * Menu and trigger entry points. Apps Script looks up these names as real
 * functions, so the build step appends wrappers that call this registry.
 * The bodies stay free of Google API details: those live in the adapters.
 */
export const HANDLERS = {
  onOpen,
  syncNow,
  dryRun,
  installHourlyTrigger,
  removeSyncTriggers,
};

export function installGlobals(): void {
  (globalThis as { __sheetsCalendarSync?: typeof HANDLERS }).__sheetsCalendarSync = HANDLERS;
}

function onOpen(): void {
  SpreadsheetApp.getUi()
    .createMenu('Calendar Sync')
    .addItem('Sync now', 'syncNow')
    .addItem('Dry run', 'dryRun')
    .addSeparator()
    .addItem('Install hourly trigger', 'installHourlyTrigger')
    .addItem('Remove sync triggers', 'removeSyncTriggers')
    .addToUi();
}

function syncNow(): void {
  runBound(false);
}

function dryRun(): void {
  runBound(true);
}

function installHourlyTrigger(): void {
  deleteSyncTriggers();
  ScriptApp.newTrigger(SYNC_HANDLER).timeBased().everyHours(1).create();
  notify('Calendar Sync', 'Hourly sync trigger installed. It runs as you, even when this sheet is closed.');
}

function removeSyncTriggers(): void {
  const removed = deleteSyncTriggers();
  const message =
    removed === 0 ? 'No Calendar Sync triggers were installed.' : `Removed ${removed} Calendar Sync trigger${removed === 1 ? '' : 's'}.`;
  notify('Calendar Sync', message);
}

function deleteSyncTriggers(): number {
  const existing = ScriptApp.getProjectTriggers();
  const ids = new Set(
    triggerIdsForHandlers(
      existing.map((trigger) => ({ id: trigger.getUniqueId(), handlerFunction: trigger.getHandlerFunction() })),
      [SYNC_HANDLER],
    ),
  );
  let removed = 0;
  for (const trigger of existing) {
    if (!ids.has(trigger.getUniqueId())) continue;
    ScriptApp.deleteTrigger(trigger);
    removed += 1;
  }
  return removed;
}

function runBound(dryRunMode: boolean): void {
  try {
    toast(dryRunMode ? 'Checking appointments…' : 'Syncing appointments…');
    const spreadsheet = SpreadsheetApp.getActive();
    const parsedConfig = parseConfigSheet(readOptionalMatrix(spreadsheet, DEFAULT_CONFIG.configSheetName));
    for (const warning of parsedConfig.warnings) logLine(warning);
    const config = resolveConfig(parsedConfig.overrides);
    const warningText = parsedConfig.warnings.length > 0 ? `${parsedConfig.warnings.join('\n')}\n\n` : '';
    const matrix = readSheetMatrix(spreadsheet, config.sheetName);
    const input: RunSyncInput = {
      matrix,
      config,
      dryRun: dryRunMode,
      calendar: createCalendarPort(config.calendarId),
      createId: (rowNumber) => makeAppointmentId(rowNumber, Date.now(), Math.random().toString(36).slice(2)),
      writeAppointmentIds: (updates) => writeAppointmentIdCells(spreadsheet, config.sheetName, config.headerRow, updates),
      writeOutcomes: (outcomes) => writeOutcomeCells(spreadsheet, config.sheetName, config.headerRow, outcomes),
      log: logLine,
    };
    notify('Calendar Sync', warningText + present(runSync(input)));
  } catch (error) {
    const message = error instanceof ConfigError || error instanceof Error ? error.message : String(error);
    logLine(message);
    notify('Calendar Sync', message);
  }
}

function present(report: SyncReport): string {
  if (!report.ok) return report.error ?? 'Sync failed.';
  const summary = report.log[report.log.length - 1] ?? '';
  const details = report.log.slice(0, -1);
  const preview = details.slice(0, 12);
  const extra = details.length > preview.length ? `\n… ${details.length - preview.length} more lines in the execution log.` : '';
  if (preview.length === 0) return summary;
  return `${summary}\n\n${preview.join('\n')}${extra}`;
}

function logLine(line: string): void {
  Logger.log(line);
  console.log(line);
}

function toast(message: string): void {
  try {
    SpreadsheetApp.getActive().toast(message, 'Calendar Sync', 5);
  } catch {
    // Installable triggers have no spreadsheet UI.
  }
}

function notify(title: string, message: string): void {
  logLine(message);
  try {
    const ui = SpreadsheetApp.getUi();
    ui.alert(title, message, ui.ButtonSet.OK);
  } catch {
    // Time-driven triggers cannot open a dialog. The execution log has the text.
  }
}

installGlobals();
