// stop-reason-answer.test.mjs: when the stop hook holds a session for a checkpoint, the reminder asks the model to end
// with its answer to the user. Measured in the audit-finding eval on 2026-09-24: a held stop made the checkpoint the
// session's last message, so the answer the user was about to read sat one message above it, and a grader that
// reads the last message judged the paperwork instead of the fix. The command stays the last thing in the reason.
//   node scripts/stop-reason-answer.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { stopReason } from "../packs/base/plugins/workflow/runtime/lib/session-hooks.mjs";

const decision = { baseline: "session-start", elapsedMinutes: 2 };
const state = { branch: "main", fingerprint: "fp", dirty: 1 };
const reason = (current) => stopReason({ decision, state, current, command: "skilliton", drift: null });

test("the reminder asks for the answer after the checkpoint, before the once-only sentence", () => {
  const r = reason({ task: null, ambiguous: [], unreadable: [] });
  const ask = r.indexOf("Once it is recorded, end with your answer to the user in a line or two, because the last message is the one they read.");
  const once = r.indexOf("This reminder is given once for this working tree state");
  assert.ok(ask > 0, r);
  assert.ok(ask < once, "the ask comes before the sentence it would otherwise split from its Otherwise");
  assert.ok(r.endsWith("--apply"), "the command is still the last thing in the reason");
});

test("with a current task too, the command stays last", () => {
  const r = reason({ task: { id: "2026-09-24-a-task-1a2b", criteria: [], checkpoints: [] }, ambiguous: [], unreadable: [] });
  assert.match(r, /Once it is recorded, end with your answer/);
  assert.ok(r.endsWith("--apply"));
});
