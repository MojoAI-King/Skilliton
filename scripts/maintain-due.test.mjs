// maintain-due.test.mjs: when the stop hook says maintenance is due (lib/maintain.mjs, evaluateMaintain). The case
// that made this file: a session committing straight to main makes no merge commit, so a merge-or-a-day rule never
// fired through an evening of commits, and a mechanical `maintain --apply` reset its clock. Now DUE_AFTER_COMMITS
// commits since the last maintain event are due, which no checkpoint can clear, and the handoff falling
// HANDOFF_BEHIND_COMMITS commits behind HEAD is due whatever the journal says, which only committing a handoff clears.
// Automatic gc is off in the fixtures: after many commits git starts one in the background, which kept writing
// objects while a test removed the folder (ENOTEMPTY on CI, 2026-09-23).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { DUE_AFTER_COMMITS, HANDOFF_BEHIND_COMMITS, evaluateMaintain, maintainReason } from "../packs/base/plugins/workflow/runtime/lib/maintain.mjs";

const HANDOFF = "docs/HANDOFF.md";
const git = (dir, ...args) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", "-c", "gc.auto=0", "-c", "maintenance.auto=false", ...args], { cwd: dir, encoding: "utf8" }).trim();

function fixture() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "skilliton-maintain-due-")));
  git(dir, "init", "-q", "-b", "main");
  mkdirSync(join(dir, "docs"));
  writeFileSync(join(dir, HANDOFF), "# Handoff\n");
  git(dir, "add", "-A"); git(dir, "commit", "-qm", "handoff");
  return dir;
}
function commits(dir, n, tag = "c") {
  for (let i = 0; i < n; i++) { writeFileSync(join(dir, "work.txt"), `${tag} ${i}\n`); git(dir, "add", "-A"); git(dir, "commit", "-qm", `${tag} ${i}`); }
}
const at = (dir, event, hoursAgo = 1) => ({ event, at: new Date(Date.now() - hoursAgo * 3600000).toISOString(), head: git(dir, "rev-parse", "HEAD") });
const rule = (dir, events, extra = {}) => evaluateMaintain({ root: dir, events, now: new Date(), integration: true, handoff: HANDOFF, ...extra });

test("the handoff one commit short of the limit is not due; at the limit it is, with the count and the file named", (t) => {
  const dir = fixture(); t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5 }));
  commits(dir, 10);
  const events = [at(dir, "maintain")];
  commits(dir, HANDOFF_BEHIND_COMMITS - 11);
  assert.equal(rule(dir, events).due, false);
  commits(dir, 1, "last");
  const d = rule(dir, events);
  assert.equal(d.due, true);
  assert.equal(d.handoffBehind, HANDOFF_BEHIND_COMMITS);
  assert.match(d.why, new RegExp(`\\(${HANDOFF}\\) is ${HANDOFF_BEHIND_COMMITS} commits behind HEAD`));
  assert.match(maintainReason(d, { command: "skilliton" }), /^Skilliton maintenance is due: the shared handoff \(docs\/HANDOFF\.md\) is 15 commits behind HEAD, the limit is 15, and only committing a new handoff clears this\. Before finishing, run: skilliton maintain --apply/);
});

test("a maintain event at HEAD does not clear it: the mechanical half alone is not maintenance", (t) => {
  const dir = fixture(); t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5 }));
  commits(dir, HANDOFF_BEHIND_COMMITS + 5);
  assert.equal(rule(dir, [at(dir, "session-start", 3), at(dir, "maintain", 0)]).due, true);
});

test("committing a new handoff clears it, and the merge-or-a-day rule applies again", (t) => {
  const dir = fixture(); t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5 }));
  commits(dir, HANDOFF_BEHIND_COMMITS + 2);
  writeFileSync(join(dir, HANDOFF), "# Handoff\n\nnew\n"); git(dir, "add", "-A"); git(dir, "commit", "-qm", "handoff written");
  const d = rule(dir, [at(dir, "maintain", 0)]);
  assert.equal(d.due, false);
  assert.match(d.why, /no merge landed and less than 24 hours passed/);
});

test("the commit count since the last maintain event is due at its limit, and a newly committed handoff does not clear it", (t) => {
  const dir = fixture(); t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5 }));
  const events = [at(dir, "maintain")];
  commits(dir, DUE_AFTER_COMMITS - 2);
  writeFileSync(join(dir, HANDOFF), "# Handoff\n\na checkpoint wrote this\n"); git(dir, "add", "-A"); git(dir, "commit", "-qm", "checkpoint with --handoff");
  assert.equal(rule(dir, events).due, false);
  commits(dir, 1, "one more");
  const d = rule(dir, events);
  assert.equal(d.due, true);
  assert.equal(d.why, `${DUE_AFTER_COMMITS} commits landed (the limit is ${DUE_AFTER_COMMITS})`);
  assert.match(maintainReason(d, { command: "skilliton" }), /^Skilliton maintenance is due: 15 commits landed \(the limit is 15\) since the last maintenance\./);
});

test("with only a session start in the journal, the paragraph says a maintenance done without skilliton maintain is not seen", (t) => {
  const dir = fixture(); t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5 }));
  const events = [at(dir, "session-start")];
  commits(dir, DUE_AFTER_COMMITS);
  assert.match(maintainReason(rule(dir, events), { command: "skilliton" }), /since this project's first recorded session \(no `skilliton maintain` run is in this repository's journal; a maintenance done without it is not seen\)\./);
});

test("it is due with no journal at all, and never off an integration branch or without a committed handoff", (t) => {
  const dir = fixture(); t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5 }));
  commits(dir, HANDOFF_BEHIND_COMMITS);
  assert.equal(rule(dir, []).due, true);
  assert.equal(rule(dir, [], { integration: false }).due, false);
  assert.equal(rule(dir, [], { handoff: "docs/NEVER_COMMITTED.md" }).due, false);
  assert.equal(rule(dir, [], { handoff: null }).due, false);
});

test("a merge still names the merge first, and a day of commits still counts", (t) => {
  const dir = fixture(); t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5 }));
  const events = [at(dir, "maintain", 30)];
  commits(dir, 1);
  assert.match(rule(dir, events).why, /30 hours and 1 commit\(s\) have passed/);
  git(dir, "checkout", "-qb", "side"); commits(dir, 1, "side"); git(dir, "checkout", "-q", "main");
  git(dir, "merge", "--no-ff", "-qm", "merge side", "side");
  assert.match(rule(dir, [at(dir, "maintain", 1)].map((e) => ({ ...e, head: git(dir, "rev-parse", "HEAD~1") }))).why, /1 merge commit\(s\) landed/);
});
