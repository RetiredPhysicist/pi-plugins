/**
 * What a settled run should notify about.
 *
 * Pi's `agent_settled` is the final notification boundary and the only event
 * that reports whether the run was aborted. `agent_end` fires earlier and may
 * still be followed by retries, recovery or queued work, so a notification sent
 * there can be both premature and wrong about how the run finished. This module
 * holds the decision alone, so it is testable without loading the extension.
 */

export interface SettleNotification {
  title: string;
  message: string;
  emoji: string;
}

/** A run's prompt, collapsed to one short line for a notification body. */
export function describeTask(prompt: unknown): string | null {
  if (typeof prompt !== "string") return null;
  const firstLine = prompt.trim().split(/\n/)[0] ?? "";
  if (!firstLine) return null;
  return firstLine.length > 40 ? `${firstLine.slice(0, 37)}...` : firstLine;
}

/**
 * The notification for a settled run.
 *
 * A cancelled run says so instead of reporting success: `aborted` distinguishes
 * a run the person stopped from one that finished on its own, and calling a
 * cancellation "Complete" is the bug this guards.
 */
export function settleNotification(
  event: { aborted?: unknown },
  projectName: string,
  taskDescription: string | null,
): SettleNotification {
  if (event?.aborted === true) {
    return {
      title: "pi ⏹ Cancelled",
      message: `Run cancelled — ${projectName}`,
      emoji: "⏹",
    };
  }
  return {
    title: "pi ✅ Complete",
    message: taskDescription ?? projectName,
    emoji: "✅",
  };
}
