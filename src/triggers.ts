/** Handler name used by the menu and by the installable hourly trigger. */
export const SYNC_HANDLER = 'syncNow';

export interface TriggerRef {
  id: string;
  handlerFunction: string;
}

/** Ids of triggers this project installed, so uninstall does not remove unrelated ones. */
export function triggerIdsForHandlers(triggers: TriggerRef[], handlers: string[]): string[] {
  const wanted = new Set(handlers);
  return triggers.filter((trigger) => wanted.has(trigger.handlerFunction)).map((trigger) => trigger.id);
}
