// lane-plan-file.test.mjs: B86. The stop hook's dispatch reminder looks for the newest lane plan at the repository
// root, LANES.md or a numbered plan such as LANES-8.md or LANES-8b.md that `skilliton dispatch --file` reads, so a
// batch planned in a numbered file is not told that no lane plan was written. LANE_BRIEF.md and LANE_REPORT.md, the
// files a lane worktree carries, are not plans.
//   node scripts/lane-plan-file.test.mjs
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { LANE_PLAN_RE, newestLanePlan } from "../packs/base/plugins/workflow/runtime/commands/hook.mjs";
import { dispatchHoldReason } from "../packs/base/plugins/workflow/runtime/lib/session-hooks.mjs";

function withDir(body) {
  const dir = mkdtempSync(join(tmpdir(), "lane-plan-"));
  try { body(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}
const touch = (dir, name, secondsAgo) => {
  writeFileSync(join(dir, name), "Base commit: 0000000\n");
  const at = new Date(Date.now() - secondsAgo * 1000);
  utimesSync(join(dir, name), at, at);
};

test("the plan names a lane plan file and nothing a lane worktree carries", () => {
  for (const name of ["LANES.md", "LANES-8.md", "LANES-8b.md", "LANES_2026-09-24.md", "LANES.batch2.md"]) assert.match(name, LANE_PLAN_RE, name);
  for (const name of ["LANE_BRIEF.md", "LANE_REPORT.md", "lanes.md", "LANES.txt", "MY-LANES.md", "LANES-8.md.bak"]) assert.doesNotMatch(name, LANE_PLAN_RE, name);
});

test("with no plan at the root, the reminder names LANES.md and has no time", () => withDir((dir) => {
  touch(dir, "LANE_BRIEF.md", 5);
  assert.deepEqual(newestLanePlan(dir), { file: "LANES.md", mtimeMs: null });
}));

test("a numbered plan counts as the lane plan, and the newest of several wins", () => withDir((dir) => {
  touch(dir, "LANES-8.md", 300);
  const one = newestLanePlan(dir);
  assert.equal(one.file, "LANES-8.md");
  assert.equal(typeof one.mtimeMs, "number");
  touch(dir, "LANES.md", 600);
  touch(dir, "LANES-8b.md", 60);
  assert.equal(newestLanePlan(dir).file, "LANES-8b.md");
}));

test("the reminder names the plan it read", () => {
  const hold = { suggestion: { items: 6 } };
  assert.match(dispatchHoldReason(hold, { laneFile: "LANES-8b.md", laneFileExists: true }), /\(LANES-8b\.md at the repository root is older than that prompt\)/);
  assert.match(dispatchHoldReason(hold, { laneFile: "LANES.md", laneFileExists: false }), /\(LANES\.md at the repository root does not exist\)/);
});

test("a root that cannot be read is treated as no plan, not an error", () => {
  assert.deepEqual(newestLanePlan(join(tmpdir(), "lane-plan-missing-folder-b86")), { file: "LANES.md", mtimeMs: null });
});
