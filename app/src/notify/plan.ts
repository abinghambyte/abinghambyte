import type { ClearResult } from "../domain/types.ts";

export type Urgency = "info" | "action" | "verify";

export interface UserNotice {
  userId: string;
  urgency: Urgency;
  /** Ordered channel escalation plan (send first; escalate on no-ack). */
  channelPlan: string[];
  headline: string;
  body: string;
}

/**
 * Turn a ClearResult into a notification plan. Note the escalation asymmetry:
 * MUST_TEST and the two "verify yourself" states escalate hard (SMS → voice);
 * a CLEAR day still notifies (it's the person's record) but doesn't escalate.
 */
export function planNotice(user: { id: string; name: string }, result: ClearResult): UserNotice {
  switch (result.status) {
    case "MUST_TEST":
      return {
        userId: user.id,
        urgency: "action",
        channelPlan: ["sms", "voice"],
        headline: "TEST TODAY",
        body: `${user.name}, you are required to test today. Report to your site during business hours. (${result.evidence})`,
      };
    case "CLEAR":
      return {
        userId: user.id,
        urgency: "info",
        channelPlan: ["sms"],
        headline: "No test today",
        body: `${user.name}, you are not required to test today. This message is saved as your record.`,
      };
    case "AMBIGUOUS":
      return {
        userId: user.id,
        urgency: "verify",
        channelPlan: ["sms", "voice"],
        headline: "CALL THE LINE YOURSELF",
        body: `${user.name}, we could not confirm today's result (${result.reason}). Please call the line yourself to be safe.`,
      };
    case "UNREACHABLE":
      return {
        userId: user.id,
        urgency: "verify",
        channelPlan: ["sms", "voice"],
        headline: "CALL THE LINE YOURSELF",
        body: `${user.name}, we could not reach the line (${result.reason}). Please call it yourself to be safe.`,
      };
  }
}

const ICON: Record<Urgency, string> = { info: "🟢", action: "🔴", verify: "🟡" };

/** Render a notice the way the console notify adapter would emit it. */
export function renderNotice(n: UserNotice): string {
  return `   ${ICON[n.urgency]} [${n.channelPlan.join(" → ")}] ${n.headline}\n      ${n.body}`;
}
