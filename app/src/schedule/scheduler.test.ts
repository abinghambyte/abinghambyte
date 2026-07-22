import test from "node:test";
import assert from "node:assert/strict";
import { dueFacilities, isDue, localDay, localHHMM, type Schedulable } from "./scheduler.ts";

const denver = "America/Denver";
const fac: Schedulable = { id: "f1", timezone: denver, availableAfter: "17:00" };

// July → Denver is MDT (UTC-6). 23:30 UTC = 17:30 MDT.
const at1730 = new Date("2026-07-21T23:30:00Z");
const at1630 = new Date("2026-07-21T22:30:00Z");
// 04:30 UTC on the 22nd = 22:30 MDT on the 21st (still the 21st locally).
const at2230SameLocalDay = new Date("2026-07-22T04:30:00Z");

test("local day/time are timezone-correct", () => {
  assert.equal(localHHMM(at1730, denver), "17:30");
  assert.equal(localDay(at1730, denver), "2026-07-21");
  assert.equal(localDay(at2230SameLocalDay, denver), "2026-07-21"); // not the 22nd
});

test("due after the local window, not before", () => {
  assert.equal(isDue(fac, at1730, new Set()), true);
  assert.equal(isDue(fac, at1630, new Set()), false);
});

test("not due again once run for the local day", () => {
  const ran = new Set(["f1:2026-07-21"]);
  assert.equal(isDue(fac, at1730, ran), false);
  assert.equal(isDue(fac, at2230SameLocalDay, ran), false); // same local day
});

test("dueFacilities filters the set", () => {
  const list: Schedulable[] = [fac, { id: "f2", timezone: denver, availableAfter: "23:00" }];
  const due = dueFacilities(list, at1730, new Set());
  assert.deepEqual(due.map((f) => f.id), ["f1"]);
});
