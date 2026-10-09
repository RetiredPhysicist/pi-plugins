/**
 * The run state the HUD shows, mirroring Pi's program status.
 *
 * Pi reports its state to the terminal over OSC 7501 (`working`, `blocked`,
 * `done`, `error`, `idle`), but that is a terminal-facing protocol: an extension
 * cannot read it back. This module reproduces the same state machine from the
 * events Pi's own reporter consumes, so the HUD shows what the terminal shows.
 *
 * The rules are taken from `ProgramStatusReporter` in pi 1.1.0:
 *
 * - `agent_start` clears the previous outcome and makes the run active.
 * - Each finished assistant response sets the run's outcome: a response that
 *   stopped on an error is `error`, anything else is `done`. The latest response
 *   wins, so a retried error is replaced by its successful retry.
 * - `agent_settled` ends the run and locks in the outcome — or `idle` when the
 *   run was aborted. `agent_end` is deliberately not used, because retries,
 *   recovery, compaction and queued work can still follow it.
 * - A dialog waiting on the person (`blocked`) outranks all of the above, and an
 *   active run outranks the resting outcome.
 *
 * `done` means one run finished. It says nothing about whether anything was
 * accepted, and it is not a test result.
 */

export type RunState = "idle" | "working" | "blocked" | "done" | "error";

/** The run's outcome, as the reporter keeps it. */
export type RunOutcome = "done" | "error" | "idle";

export interface RunStateSnapshot {
  /** A run is active. */
  active: boolean;
  /** A compaction is in progress, which reports a distinct working message. */
  compacting: boolean;
  /** The outcome of the current run, reported once it settles. */
  outcome: RunOutcome;
  /** What to report while no run is active. */
  resting: RunOutcome;
  /** Whether an extension dialog is waiting on the person. */
  blocked: boolean;
  /** The blocked dialog's kind and title, for the HUD line. */
  blockedKind?: string;
  blockedTitle?: string;
}

export function initialSnapshot(): RunStateSnapshot {
  return {
    active: false,
    compacting: false,
    outcome: "done",
    resting: "idle",
    blocked: false,
  };
}

/**
 * The state to show, by the reporter's own precedence: a waiting dialog, then
 * compaction, then a running turn, then the resting outcome.
 */
export function resolveRunState(snapshot: RunStateSnapshot): RunState {
  if (snapshot.blocked) return "blocked";
  if (snapshot.compacting) return "working";
  if (snapshot.active) return "working";
  return snapshot.resting;
}

/** How a state reads in the HUD: an icon, a label and an emphasis. */
export function describeRunState(state: RunState): {
  icon: string;
  label: string;
  tone: "ok" | "busy" | "blocked" | "done" | "error";
} {
  switch (state) {
    case "working":
      return { icon: "↻", label: "working", tone: "busy" };
    case "blocked":
      return { icon: "⧗", label: "waiting for user", tone: "blocked" };
    case "done":
      return { icon: "✔", label: "done", tone: "done" };
    case "error":
      return { icon: "✘", label: "error", tone: "error" };
    default:
      return { icon: "◦", label: "idle", tone: "ok" };
  }
}

/** The reporter's `firstLine`: the message an error state carries. */
export function firstLine(text: unknown): string {
  if (typeof text !== "string") return "Error";
  return text.split(/\r?\n/, 1)[0]?.trim() || "Error";
}
