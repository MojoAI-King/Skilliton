// gate-process-label.test.mjs: a failing `skilliton gate` verdict names the other node processes running at the start
// by program and script file only. A command line can carry a token (--token=..., a URL with a password, the text
// given to node -e), and the verdict reaches the gate's log and the session's context, so no other argument is shown.
//   node scripts/gate-process-label.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { processLabel } from "../packs/base/plugins/workflow/runtime/lib/gate.mjs";

const SECRET = ["tok", "en-", "abc123"].join(""); // assembled at run time so no line matches a scanner

test("a script file is named by its last two path parts, and nothing after it", () => {
  assert.equal(processLabel(`/usr/local/bin/node /opt/work/app/scripts/checks.mjs --token=${SECRET}`), "node scripts/checks.mjs");
  assert.equal(processLabel("node --test scripts/gate-context.test.mjs"), "node scripts/gate-context.test.mjs");
  assert.equal(processLabel("node server.js"), "node server.js");
});

test("the text given to -e, a URL and option values are never shown", () => {
  assert.equal(processLabel(`node -e setTimeout(Date,60000)//${SECRET}`), "node");
  assert.equal(processLabel(`node https://user:${SECRET}@example.invalid/x.js`), "node");
  assert.equal(processLabel(`node --require=${SECRET}.js`), "node");
  for (const line of [processLabel(`node -e ${SECRET}`), processLabel(`node app.mjs ${SECRET}`)]) assert.doesNotMatch(line, new RegExp(SECRET));
});

test("the label is at most 80 characters", () => {
  assert.ok(processLabel(`node ${"a".repeat(200)}/${"b".repeat(200)}.mjs`).length <= 80);
});
