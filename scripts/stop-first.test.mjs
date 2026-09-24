// stop-first.test.mjs: N33. The first stop of a session that changed files and recorded no checkpoint is held once,
// however short the session: a session that never checkpoints leaves the next one nothing to resume from, and the
// minutes rule (checkpoints.minMinutes, 20 by default) never fires in a short one. checkpoints.holdFirstStop (default
// true) turns it off, which restores the minutes rule exactly; once a checkpoint exists in the session, the minutes
// rule governs as before, and the stop-reminded rule keeps every reminder to once per working tree state.
//
// evaluateStop is a pure function, so each case calls it with the journal events and the working tree state.
//   node scripts/stop-first.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULTS, configProblems } from "../packs/base/plugins/workflow/runtime/lib/config.mjs";
import { evaluateStop } from "../packs/base/plugins/workflow/runtime/lib/session-hooks.mjs";

const NOW = new Date("2026-09-24T12:00:00Z");
const ago = (minutes) => new Date(NOW.getTime() - minutes * 60000).toISOString();
const START = { event: "session-start", session: "s1", at: ago(2), fingerprint: "fp-start", head: "h1" };
const DIRTY = { fingerprint: "fp-now", dirty: 1, branch: "work" };
const stop = ({ events = [START], state = DIRTY, checkpoints = {} } = {}) => evaluateStop({
  stopHookActive: false, checkpoints: { ...DEFAULTS.checkpoints, ...checkpoints }, state, events, session: "s1", now: NOW,
});

test("holdFirstStop is on by default, and anything but true or false is refused like the other checkpoint settings", () => {
  assert.equal(DEFAULTS.checkpoints.holdFirstStop, true);
  assert.equal(DEFAULTS.checkpoints.minMinutes, 20, "the minutes rule itself is unchanged");
  assert.deepEqual(configProblems({ checkpoints: { holdFirstStop: false } }), []);
  assert.deepEqual(configProblems({ checkpoints: { holdFirstStop: "yes" } }), ["checkpoints.holdFirstStop must be true or false"]);
});

test("a two-minute session with a changed tree and no checkpoint is held on its first stop", () => {
  const d = stop();
  assert.equal(d.block, true, d.why);
  assert.equal(d.baseline, "session-start");
  assert.equal(d.elapsedMinutes, 2);
  assert.match(d.why, /first stop of this session/);
});

test("the same state after a reminder for that fingerprint is not held again", () => {
  const d = stop({ events: [START, { event: "stop-reminded", session: "s1", at: ago(1), fingerprint: "fp-now" }] });
  assert.equal(d.block, false);
  assert.equal(d.why, "a reminder was already given for this working tree state");
});

test("holdFirstStop false restores the minutes rule: two of twenty minutes is too early", () => {
  const d = stop({ checkpoints: { holdFirstStop: false } });
  assert.equal(d.block, false);
  assert.equal(d.why, "less than 20 minutes since the session started");
  assert.equal(stop({ checkpoints: { holdFirstStop: false }, events: [{ ...START, at: ago(30) }] }).block, true, "control: past the minutes it blocks");
});

test("a session whose checkpoint was five minutes ago is judged by the minutes rule, not held", () => {
  const events = [{ ...START, at: ago(30) }, { event: "checkpoint", session: "s1", at: ago(5), fingerprint: "fp-checkpoint", head: "h1" }];
  const d = stop({ events });
  assert.equal(d.block, false);
  assert.equal(d.why, "less than 20 minutes since the last checkpoint");
});

test("a checkpoint from before this session began does not count: the first stop is still held", () => {
  const events = [{ event: "checkpoint", session: "s0", at: ago(90), fingerprint: "fp-old", head: "h0" }, START];
  assert.equal(stop({ events }).block, true);
});

test("a clean tree is never held, even on the first stop", () => {
  const d = stop({ state: { fingerprint: "fp-now", dirty: 0, branch: "work" } });
  assert.equal(d.block, false);
  assert.match(d.why, /the working tree is clean/);
});
