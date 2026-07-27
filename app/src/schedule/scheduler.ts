/**
 * Timezone-correct scheduling. Each facility publishes results "after HH:MM" in
 * ITS OWN timezone (e.g. "after 17:00 America/Denver"). We must fire the daily
 * check in facility-local time and run each facility at most once per local day.
 *
 * Uses the built-in Intl API (zero deps) and is DST-safe (IANA zones, not offsets).
 */

export interface Schedulable {
  id: string;
  timezone: string; // IANA, e.g. "America/Denver"
  availableAfter: string; // "HH:MM" 24h, facility-local
}

function localParts(now: Date, timeZone: string): Record<string, string> {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const out: Record<string, string> = {};
  for (const p of fmt.formatToParts(now)) out[p.type] = p.value;
  return out;
}

/** Facility-local calendar day, "YYYY-MM-DD". */
export function localDay(now: Date, timeZone: string): string {
  const p = localParts(now, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Facility-local time of day, "HH:MM" (h23), string-comparable. */
export function localHHMM(now: Date, timeZone: string): string {
  const p = localParts(now, timeZone);
  return `${p.hour}:${p.minute}`;
}

/** Whether a facility is due now: past its local "available after" and not yet
 *  run for its local day. `ranDays` holds `${id}:${localDay}` keys already run. */
export function isDue(f: Schedulable, now: Date, ranDays: ReadonlySet<string>): boolean {
  const day = localDay(now, f.timezone);
  if (ranDays.has(`${f.id}:${day}`)) return false;
  return localHHMM(now, f.timezone) >= f.availableAfter;
}

export function dueFacilities<T extends Schedulable>(facilities: T[], now: Date, ranDays: ReadonlySet<string>): T[] {
  return facilities.filter((f) => isDue(f, now, ranDays));
}
