import { describe, it } from "node:test";
import assert from "node:assert/strict";
import register, { statedIntent } from "../extensions/default-tools.ts";

/** A minimal stand-in for the Pi extension API. */
function harness(options: {
  active?: string[];
  defaultTools?: string[];
  hasSettings?: boolean;
} = {}) {
  const handlers = new Map<string, () => void | Promise<void>>();
  const pi = {
    on(event: string, cb: () => void | Promise<void>) {
      handlers.set(event, cb);
    },
    getActiveTools: () => options.active ?? [],
    setActiveTools(tools: string[]) {
      options.active = tools;
    },
    ...(options.hasSettings === false
      ? {}
      : { getSettings: () => (options.defaultTools ? { defaultTools: options.defaultTools } : {}) }),
  };
  register(pi as never);
  return {
    active: () => options.active ?? [],
    async start() {
      const handler = handlers.get("before_agent_start");
      if (handler) await handler();
    },
  };
}

describe("statedIntent", () => {
  it("reads a plain name and +name as added", () => {
    assert.equal(statedIntent(["find"], "find"), "added");
    assert.equal(statedIntent(["+find"], "find"), "added");
  });

  it("reads -name as removed", () => {
    assert.equal(statedIntent(["-find"], "find"), "removed");
  });

  it("treats an absent or unnamed tool as unset", () => {
    assert.equal(statedIntent(undefined, "find"), "unset");
    assert.equal(statedIntent([], "find"), "unset");
    assert.equal(statedIntent(["+grep"], "find"), "unset");
  });

  it("ignores non-string entries", () => {
    assert.equal(statedIntent([1 as never, "-find"], "find"), "removed");
  });
});

describe("pi-all-tools extension", () => {
  it("adds the missing tools on an unconfigured install", async () => {
    const pi = harness({ active: ["read", "bash", "edit", "write"] });
    await pi.start();
    assert.deepEqual(pi.active(), ["read", "bash", "edit", "write", "find", "grep", "ls"]);
  });

  it("leaves the active set alone when nothing is missing", async () => {
    const pi = harness({ active: ["read", "find", "grep", "ls"] });
    await pi.start();
    assert.deepEqual(pi.active(), ["read", "find", "grep", "ls"]);
  });

  it("respects a native removal instead of re-adding the tool", async () => {
    const pi = harness({ active: ["read", "grep"], defaultTools: ["-find"] });
    await pi.start();
    // find stays removed; grep and ls are still filled in.
    assert.deepEqual(pi.active(), ["read", "grep", "ls"]);
  });

  it("still adds a tool the setting never mentions", async () => {
    const pi = harness({ active: ["read"], defaultTools: ["+grep"] });
    await pi.start();
    assert.deepEqual(pi.active(), ["read", "find", "grep", "ls"]);
  });

  it("falls back to the legacy behavior when settings are unavailable", async () => {
    const pi = harness({ active: ["read"], hasSettings: false });
    await pi.start();
    assert.deepEqual(pi.active(), ["read", "find", "grep", "ls"]);
  });

  it("never throws when the active-tool API is missing", async () => {
    const handlers = new Map<string, () => void | Promise<void>>();
    const pi = {
      on(event: string, cb: () => void | Promise<void>) {
        handlers.set(event, cb);
      },
      getSettings: () => ({}),
    };
    register(pi as never);
    const handler = handlers.get("before_agent_start");
    assert.ok(handler);
    await handler();
  });
});
