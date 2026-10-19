import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { describeBeforeAgentStart, describeTask, settleNotification } from "../extensions/settle.ts";

describe("describeTask", () => {
  it("takes the first line of the prompt", () => {
    assert.equal(describeTask("Fix the build\nand then tag it"), "Fix the build");
  });

  it("truncates a long first line", () => {
    const long = "a".repeat(100);
    const result = describeTask(long);
    assert.equal(result, `${"a".repeat(37)}...`);
    assert.equal(result?.length, 40);
  });

  it("returns null for empty or non-string prompts", () => {
    assert.equal(describeTask(""), null);
    assert.equal(describeTask("   \n  "), null);
    assert.equal(describeTask(undefined), null);
    assert.equal(describeTask({ text: "hi" }), null);
  });
});

describe("describeBeforeAgentStart", () => {
  it("reads the prompt from a user run", () => {
    assert.equal(describeBeforeAgentStart({ messageType: "user", prompt: "Fix the build" }), "Fix the build");
  });

  it("reads text content from a custom-message run", () => {
    const event = {
      messageType: "custom",
      message: { role: "custom", content: [{ type: "text", text: "Review the release\nand tag it" }] },
    };
    assert.equal(describeBeforeAgentStart(event), "Review the release");
  });

  it("reads string content from a custom-message run", () => {
    const event = {
      messageType: "custom",
      message: { role: "custom", content: "Review the release" },
    };
    assert.equal(describeBeforeAgentStart(event), "Review the release");
  });

  it("ignores non-text custom content", () => {
    assert.equal(
      describeBeforeAgentStart({
        messageType: "custom",
        message: { role: "custom", content: [{ type: "image", data: "..." }] },
      }),
      null,
    );
  });
});

describe("settleNotification", () => {
  it("reports a natural finish as complete", () => {
    const note = settleNotification({ aborted: false }, "pi-plugins", "Run the tests");
    assert.equal(note.emoji, "✅");
    assert.match(note.title, /Complete/);
    assert.equal(note.message, "Run the tests");
  });

  it("reports a cancelled run as cancelled, not complete", () => {
    const note = settleNotification({ aborted: true }, "pi-plugins", "Run the tests");
    assert.equal(note.emoji, "⏹");
    assert.match(note.title, /Cancelled/);
    assert.match(note.message, /cancelled/i);
  });

  it("falls back to the project name when no prompt was captured", () => {
    const note = settleNotification({ aborted: false }, "pi-plugins", null);
    assert.equal(note.message, "pi-plugins");
  });

  it("treats an absent aborted flag as a natural finish", () => {
    const note = settleNotification({}, "pi-plugins", "task");
    assert.equal(note.emoji, "✅");
  });
});
