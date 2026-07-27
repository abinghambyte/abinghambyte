import test from "node:test";
import assert from "node:assert/strict";
import { compileToTwiml } from "./twiml.ts";
import type { IvrScript } from "./types.ts";

const sentryScript: IvrScript = {
  facilityId: "fac_sentry_b",
  version: 4,
  phone: "+1-970-295-4766",
  steps: [
    { wait: "prompt", expect: "language", timeoutSec: 20 },
    { sendDigits: "1" },
    { wait: "prompt", expect: "id", timeoutSec: 15 },
    { sendDigits: "{{user.testingId}}#" },
    { wait: "prompt", expect: "name", timeoutSec: 15 },
    { sendDigits: "{{user.lastNameFirst3Dtmf}}" },
    { record: { start: "afterPrompt", expect: "result", maxSec: 30 } },
  ],
};

test("compiles per-user DTMF with substitution", () => {
  const { twiml, digits } = compileToTwiml(sentryScript, { testingId: "1001", lastNameFirst3Dtmf: "336" });
  assert.match(twiml, /<Play digits="1"\/>/);
  assert.match(twiml, /<Play digits="1001#"\/>/);
  assert.match(twiml, /<Play digits="336"\/>/);
  assert.deepEqual(digits, ["1", "1001#", "336"]);
});

test("no unresolved template placeholders remain", () => {
  const { twiml } = compileToTwiml(sentryScript, { testingId: "42", lastNameFirst3Dtmf: "555" });
  assert.doesNotMatch(twiml, /\{\{/);
});

test("wait steps become pauses; record step becomes a trailing pause of maxSec", () => {
  const { twiml } = compileToTwiml(sentryScript, {}, { promptPauseSec: 5 });
  assert.match(twiml, /<Pause length="5"\/>/); // prompt pause
  assert.match(twiml, /<Pause length="30"\/>/); // record capture window
  assert.ok(twiml.trim().startsWith("<?xml"));
  assert.ok(twiml.trim().endsWith("</Response>"));
});

test("missing vars substitute to empty (never leak the template)", () => {
  const { digits } = compileToTwiml(sentryScript, {});
  assert.deepEqual(digits, ["1", "#", ""]);
});
