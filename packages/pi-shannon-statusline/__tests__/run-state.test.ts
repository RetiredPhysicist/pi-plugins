import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  describeRunState,
  firstLine,
  initialSnapshot,
  resolveRunState,
  type RunStateSnapshot,
} from "../src/run-state.ts";

function snap(overrides: Partial<RunStateSnapshot> = {}): RunStateSnapshot {
  return { ...initialSnapshot(), ...overrides };
}

describe("initial state", () => {
  it("starts idle", () => {
    assert.equal(resolveRunState(initialSnapshot()), "idle");
  });
});

describe("precedence", () => {
  it("reports blocked above everything else", () => {
    assert.equal(resolveRunState(snap({ blocked: true, active: true, compacting: true })), "blocked");
  });

  it("reports working while a run is active", () => {
    assert.equal(resolveRunState(snap({ active: true })), "working");
  });

  it("reports working while compacting", () => {
    assert.equal(resolveRunState(snap({ compacting: true })), "working");
  });

  it("reports the resting outcome when nothing is running", () => {
    assert.equal(resolveRunState(snap({ resting: "done" })), "done");
    assert.equal(resolveRunState(snap({ resting: "error" })), "error");
    assert.equal(resolveRunState(snap({ resting: "idle" })), "idle");
  });
});

describe("settled outcomes", () => {
  /** Mirror the reporter: run, decide an outcome, settle. */
  function settle(options: { outcome?: "done" | "error"; aborted?: boolean } = {}) {
    let state = snap({ active: true, outcome: options.outcome ?? "done" });
    state = {
      ...state,
      active: false,
      resting: options.aborted ? "idle" : state.outcome,
    };
    return state;
  }

  it("a natural finish settles as done", () => {
    assert.equal(resolveRunState(settle()), "done");
  });

  it("a cancelled run settles as idle, not done", () => {
    assert.equal(resolveRunState(settle({ aborted: true })), "idle");
  });

  it("an aborted run is idle even if a response had said error", () => {
    assert.equal(resolveRunState(settle({ outcome: "error", aborted: true })), "idle");
  });

  it("an errored run settles as error", () => {
    assert.equal(resolveRunState(settle({ outcome: "error" })), "error");
  });
});

describe("describeRunState", () => {
  it("gives each state an icon, label and tone", () => {
    assert.deepEqual(describeRunState("working"), { icon: "↻", label: "working", tone: "busy" });
    assert.equal(describeRunState("blocked").tone, "blocked");
    assert.equal(describeRunState("done").icon, "✔");
    assert.equal(describeRunState("error").tone, "error");
    assert.equal(describeRunState("idle").tone, "ok");
  });
});

describe("firstLine", () => {
  it("takes the first line of an error message", () => {
    assert.equal(firstLine("boom\ntrace"), "boom");
  });

  it("falls back to Error", () => {
    assert.equal(firstLine(undefined), "Error");
    assert.equal(firstLine("   "), "Error");
  });
});
