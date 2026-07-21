import type { CallVars, IvrScript } from "./types.ts";

/**
 * Compile a declarative IvrScript into Twilio TwiML for an outbound call.
 *
 * This is the "static timing" first cut: it plays DTMF with fixed pauses and
 * relies on call-level recording to capture the spoken result. It CANNOT detect
 * a changed menu, an "invalid ID" re-prompt, or voicemail — a blind script can't
 * listen. The robust version (M2 hardening) replaces this with a `<Gather>` +
 * webhook state machine (or Media Streams) that reacts to each prompt. See
 * docs/DEV-ROADMAP.md M2. Until then, real calls fail safe: no confident result
 * → AMBIGUOUS → "verify yourself".
 */

export interface TwimlOptions {
  /**
   * Heuristic pause (seconds) to let a prompt finish before sending digits.
   * Static TwiML can't detect the real end of a prompt; the webhook upgrade does.
   */
  promptPauseSec?: number;
}

export interface CompiledTwiml {
  twiml: string;
  /** The DTMF strings we will send, in order — recorded in the audit log. */
  digits: string[];
}

function substitute(s: string, vars: CallVars): string {
  return s
    .replace(/\{\{user\.testingId\}\}/g, vars.testingId ?? "")
    .replace(/\{\{user\.lastNameFirst3Dtmf\}\}/g, vars.lastNameFirst3Dtmf ?? "");
}

const XML: Record<string, string> = { "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" };
const escapeXml = (s: string): string => s.replace(/[<>&'"]/g, (c) => XML[c] ?? c);

export function compileToTwiml(script: IvrScript, vars: CallVars = {}, opts: TwimlOptions = {}): CompiledTwiml {
  const promptPause = opts.promptPauseSec ?? 4;
  const digits: string[] = [];
  const lines: string[] = ['<?xml version="1.0" encoding="UTF-8"?>', "<Response>"];

  for (const step of script.steps) {
    if ("wait" in step) {
      // Approximate "wait for the prompt" with a fixed pause.
      lines.push(`  <Pause length="${promptPause}"/>`);
    } else if ("sendDigits" in step) {
      const d = substitute(step.sendDigits, vars);
      digits.push(d);
      lines.push(`  <Play digits="${escapeXml(d)}"/>`);
    } else {
      // record step: call-level recording is enabled on the call itself; here we
      // simply stay on the line long enough for the result message to play.
      lines.push(`  <Pause length="${step.record.maxSec}"/>`);
    }
  }

  lines.push("</Response>");
  return { twiml: lines.join("\n"), digits };
}
