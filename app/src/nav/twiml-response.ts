import type { NavCommand } from "./engine.ts";

/**
 * TwiML the webhook returns to Twilio each turn. We navigate by transcribing the
 * remote IVR's speech: each `<Gather input="speech">` posts a SpeechResult to our
 * action URL, which is the next observation. On `play` we send DTMF first.
 */

const escapeXml = (s: string): string =>
  s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c] as string);

/** Wrap navigation: optionally play digits, then gather the next spoken prompt. */
export function gatherResponse(command: { type: "play"; digits: string } | { type: "listen" }, actionUrl: string): string {
  const play = command.type === "play" ? `\n  <Play digits="${escapeXml(command.digits)}"/>` : "";
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n<Response>${play}\n` +
    `  <Gather input="speech" action="${escapeXml(actionUrl)}" method="POST" speechTimeout="auto" actionOnEmptyResult="true"/>\n` +
    `</Response>`
  );
}

/** Terminal: end the call. */
export function hangupResponse(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Hangup/>\n</Response>`;
}

/** Convenience: does this command end the call? */
export function isTerminal(command: NavCommand): boolean {
  return command.type === "done" || command.type === "record";
}
