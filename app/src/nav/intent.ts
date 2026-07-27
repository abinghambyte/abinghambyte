import type { IntentName, IntentRule, PromptObservation } from "./types.ts";

/**
 * Built-in intent rules common to most testing lines. Facility-specific rules
 * (from the NavFlow) are checked FIRST, so a facility can always override.
 */
const BUILTINS: IntentRule[] = [
  { intent: "invalid_id", anyOf: ["invalid", "not recognized", "not a valid", "incorrect", "try again", "does not match"] },
  { intent: "voicemail", anyOf: ["leave a message", "at the tone", "not available", "voicemail", "record your message", "after the beep"] },
  { intent: "hold", anyOf: ["please hold", "please wait", "one moment", "all representatives", "your call is important"] },
];

const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Recognize the intent of a prompt observation. Pure. Transport events win over
 * text; then facility rules; then built-ins; else "unknown".
 */
export function recognizeIntent(obs: PromptObservation, facilityRules: IntentRule[]): IntentName {
  if (obs.event === "voicemail") return "voicemail";
  if (obs.event === "hold") return "hold";
  if (obs.event === "hangup") return "hangup";
  if (obs.event === "silence" || obs.text === null || obs.text.trim() === "") return "unknown";

  const text = norm(obs.text);
  for (const rule of facilityRules) {
    if (rule.anyOf.some((p) => text.includes(norm(p)))) return rule.intent;
  }
  for (const rule of BUILTINS) {
    if (rule.anyOf.some((p) => text.includes(norm(p)))) return rule.intent;
  }
  return "unknown";
}
