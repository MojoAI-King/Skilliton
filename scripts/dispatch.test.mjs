#!/usr/bin/env node
// dispatch.test.mjs: `skilliton dispatch` and the engine in packs/base/plugins/workflow/runtime/lib/dispatch.mjs.
//
// Every test runs the command the way a person does (node scripts/skilliton.mjs dispatch ...) in its own temporary
// Git repository under the system temp folder, with HOME and Git's global configuration pointed away from the real
// ones, and removes that folder afterwards. What each refusal has to prove is the same thing twice: the message
// names the problem, and nothing was created (no lane folder, no lane branch, no brief).
//
//   node --test scripts/dispatch.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const CLI = join(here, "skilliton.mjs");

const BASE_ENV = (() => {
  const env = {
    ...process.env, SKILLITON_SELF: "skilliton", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "Skilliton Test", GIT_AUTHOR_EMAIL: "test@example.invalid",
    GIT_COMMITTER_NAME: "Skilliton Test", GIT_COMMITTER_EMAIL: "test@example.invalid",
  };
  delete env.SKILLITON_DEBUG;
  return env;
})();

function git(dir, ...args) {
  return execFileSync("git", ["-C", dir, ...args], { env: BASE_ENV, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

// A repository with one commit, a src file to name in an item, and the lane root beside it (base/repo-lanes).
function fixture(t, { config = null, commits = 1 } = {}) {
  const base = mkdtempSync(join(realpathSync(tmpdir()), "skilliton-dispatch-"));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const ctx = { base, dir: join(base, "repo"), home: join(base, "home"), laneRoot: join(base, "repo-lanes") };
  for (const d of [ctx.dir, ctx.home]) mkdirSync(d);
  git(ctx.dir, "init", "-q", "-b", "main");
  if (config !== null) {
    mkdirSync(join(ctx.dir, ".skilliton"), { recursive: true });
    writeFileSync(join(ctx.dir, ".skilliton", "config.json"), `${JSON.stringify(config, null, 2)}\n`);
  }
  for (let i = 0; i < commits; i++) {
    writeFileSync(join(ctx.dir, "README.md"), `# repo\n\ncommit ${i}\n`);
    git(ctx.dir, "add", "-A");
    git(ctx.dir, "commit", "-q", "-m", `commit ${i}`);
  }
  ctx.head = commits ? git(ctx.dir, "rev-parse", "HEAD").trim() : null;
  return ctx;
}

function sg(ctx, args, { cwd = ctx.dir } = {}) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, env: { ...BASE_ENV, HOME: ctx.home }, encoding: "utf8" });
  return { code: r.status, out: r.stdout ?? "", err: r.stderr ?? "" };
}

const lanePlan = (ctx, body) => writeFileSync(join(ctx.dir, "LANES.md"), body.replace(/\{base\}/g, ctx.head ?? ""));

const TWO_LANES = `Read "/tmp/repo/LANES.md", find the lane whose folder matches this one, and follow its brief exactly.

Base commit: {base}

## Lane: reviews   branch: lane/reviews-0920   model: sonnet   context ceiling: 120000

### Brief
Anything here is the skill's own wording; dispatch reads the heading and the items.

Items:
N1. [TOUCH] Fix the empty state copy: src/review/empty.tsx: the card names the next step
N3. [FEATURE] Add a filter: src/review/list.tsx: the list filters by author

## Lane: billing   branch: lane/billing-0920   model: opus   context ceiling: 200000

Items:
N2. [FEATURE] Retry a failed charge: src/billing/retry.ts: a failed charge retries once and is logged
`;

const branches = (ctx) => git(ctx.dir, "branch", "--format=%(refname:short)").split("\n").map((b) => b.trim()).filter(Boolean).sort();

function assertNothingCreated(ctx, r) {
  assert.equal(r.code, 2, `expected a refusal (exit 2), got ${r.code}: ${r.err || r.out}`);
  assert.match(r.err, /Nothing was created|no worktree was created/, "the refusal says nothing was created");
  assert.deepEqual(branches(ctx), ["main"], "no lane branch was created");
  assert.equal(existsSync(ctx.laneRoot), false, "the lane root was not created");
}

test("preview: the plan names every lane, its folder, its branch and its items, and writes nothing", (t) => {
  const ctx = fixture(t, { config: { dispatch: { mainOnlyPaths: ["docs/", "DECISIONS.md"], laneTestCommand: "npm test", laneSetup: ["npm ci", "createdb {lane}"] } } });
  lanePlan(ctx, TWO_LANES);
  const r = sg(ctx, ["dispatch"]);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^skilliton dispatch \(preview\): 2 lanes from LANES\.md$/m);
  assert.match(r.out, new RegExp(`^ {2}base commit:\\s+${ctx.head.slice(0, 12)} \\(named in LANES\\.md line 3\\)$`, "m"));
  assert.match(r.out, /^ {2}Lane reviews {3}branch lane\/reviews-0920 {3}model sonnet {3}context ceiling 120000$/m);
  assert.match(r.out, /^ {4}items:\s+2 \(N1, N3\)$/m);
  assert.match(r.out, /^ {2}Lane billing {3}branch lane\/billing-0920 {3}model opus {3}context ceiling 200000$/m);
  assert.match(r.out, /^ {4}items:\s+1 \(N2\)$/m);
  assert.match(r.out, /git worktree add .*repo-lanes\/reviews -b lane\/reviews-0920 [0-9a-f]{40}$/m);
  assert.match(r.out, /^ {2}main-only:\s+docs\/, DECISIONS\.md$/m);
  assert.match(r.out, /^ {2}setup:\s+npm ci; createdb \{lane\} \(dispatch does not run it; each brief names it\)$/m);
  assert.match(r.out, /^Preview only; nothing was created\. To create them, run the same command with --apply\.$/m);
  assert.equal(existsSync(ctx.laneRoot), false, "the preview created no folder");
  assert.deepEqual(branches(ctx), ["main"], "the preview created no branch");
  assert.equal(existsSync(join(ctx.dir, ".git", "info", "exclude")) ? readFileSync(join(ctx.dir, ".git", "info", "exclude"), "utf8").includes("LANE_BRIEF.md") : false, false, "the preview did not touch info/exclude");
  assert.equal(sg(ctx, ["dispatch", "--preview"]).out, r.out, "--preview asks for the same plan");
});

test("--apply creates one worktree per lane with git worktree add under the lane root, after showing the plan", (t) => {
  const ctx = fixture(t, { config: { dispatch: { laneTestCommand: "npm test" } } });
  lanePlan(ctx, TWO_LANES);
  const r = sg(ctx, ["dispatch", "--apply"]);
  assert.equal(r.code, 0, r.err);
  const plannedAt = r.out.indexOf("skilliton dispatch: 2 lanes from LANES.md");
  const wroteAt = r.out.indexOf("created ");
  assert.ok(plannedAt >= 0 && wroteAt > plannedAt, "the plan is printed before what was created");
  for (const [name, branch] of [["reviews", "lane/reviews-0920"], ["billing", "lane/billing-0920"]]) {
    const dir = join(ctx.laneRoot, name);
    assert.equal(existsSync(join(dir, "README.md")), true, `${name}: the worktree holds the repository's files`);
    assert.equal(git(dir, "branch", "--show-current").trim(), branch, `${name}: the worktree is on its own branch`);
    assert.equal(git(dir, "rev-parse", "HEAD").trim(), ctx.head, `${name}: the branch starts at the base commit`);
    assert.match(r.out, new RegExp(`^created .*repo-lanes/${name} on ${branch.replace("/", "\\/")} from ${ctx.head.slice(0, 12)}, with LANE_BRIEF\\.md$`, "m"));
  }
  assert.deepEqual(branches(ctx), ["lane/billing-0920", "lane/reviews-0920", "main"]);
  const exclude = readFileSync(join(ctx.dir, ".git", "info", "exclude"), "utf8");
  assert.match(exclude, /^LANE_BRIEF\.md$/m);
  assert.match(exclude, /^LANE_REPORT\.md$/m);
  assert.match(r.out, /^info\/exclude: added LANE_BRIEF\.md, LANE_REPORT\.md$/m);
  assert.match(r.out, /^Next: open each folder in its own window, start a fresh session there, and say: read LANE_BRIEF\.md at the root of this worktree and follow it\.$/m);
  const second = sg(ctx, ["dispatch", "--apply"]);
  assert.equal(second.code, 2, "a second run of the same plan is refused, not repeated");
  assert.match(second.err, /the branch lane\/reviews-0920 already exists/);
});

test("each lane's brief carries its scope, its bound, its model and the main-only paths, and never runs the setup", (t) => {
  const ctx = fixture(t, { config: { dispatch: { mainOnlyPaths: ["docs/", "DECISIONS.md"], laneTestCommand: "npm test", mainOnlyChecks: ["npm run e2e"], laneSetup: ["touch {lane}-setup-ran"] } } });
  lanePlan(ctx, TWO_LANES);
  assert.equal(sg(ctx, ["dispatch", "--apply"]).code, 0);
  const brief = readFileSync(join(ctx.laneRoot, "reviews", "LANE_BRIEF.md"), "utf8");
  assert.match(brief, /^# Lane brief: reviews$/m);
  assert.match(brief, /^- \*\*Branch:\*\* lane\/reviews-0920, created from [0-9a-f]{12} \(named in LANES\.md line 3\)$/m);
  assert.match(brief, /^- \*\*Model:\*\* sonnet \(named in LANES\.md\)$/m);
  assert.match(brief, /^- \*\*Context ceiling:\*\* 120000 \(named in LANES\.md\)$/m);
  assert.match(brief, /^## Scope: 2 items$/m);
  assert.match(brief, /^N1\. \[TOUCH\] Fix the empty state copy: src\/review\/empty\.tsx: the card names the next step$/m);
  assert.match(brief, /^N3\. \[FEATURE\] Add a filter/m);
  assert.equal(brief.includes("N2."), false, "one lane's brief does not carry another lane's items");
  assert.match(brief, /^- \*\*Read:\*\* this brief, the files the items name/m);
  assert.match(brief, /^- \*\*Return:\*\* LANE_REPORT\.md at the root of this worktree/m);
  assert.match(brief, /Work that needs more than the ceiling was scoped too wide/);
  assert.match(brief, /^## Paths that belong to the integration branch$/m);
  assert.match(brief, /^- docs\/$/m);
  assert.match(brief, /^- DECISIONS\.md$/m);
  assert.match(brief, /Run in this worktree: `npm test`/);
  assert.match(brief, /^Do not run: npm run e2e\. main runs those once at merge\.$/m);
  assert.match(brief, /^touch reviews-setup-ran$/m, "the setup command is written into the brief with {lane} filled in");
  assert.equal(existsSync(join(ctx.laneRoot, "reviews", "reviews-setup-ran")), false, "dispatch did not run the setup command");
  assert.match(brief, /git merge-base --is-ancestor [0-9a-f]{40} HEAD/);
  const billing = readFileSync(join(ctx.laneRoot, "billing", "LANE_BRIEF.md"), "utf8");
  assert.match(billing, /^## Scope: 1 item$/m);
  assert.match(billing, /^N2\. \[FEATURE\] Retry a failed charge/m);
});

test("a lane whose branch already exists is refused, and nothing is created", (t) => {
  const ctx = fixture(t);
  lanePlan(ctx, TWO_LANES);
  git(ctx.dir, "branch", "lane/billing-0920");
  const r = sg(ctx, ["dispatch", "--apply"]);
  assert.equal(r.code, 2, r.out);
  assert.match(r.err, /the branch lane\/billing-0920 already exists, so lane billing \(line \d+\) would not be created/);
  assert.match(r.err, /git branch -d lane\/billing-0920/);
  assert.equal(existsSync(ctx.laneRoot), false, "the first lane was not created either");
  assert.deepEqual(branches(ctx), ["lane/billing-0920", "main"], "only the branch that already existed is there");
});

test("a lane folder that already exists, and one Git still has registered, are both refused", (t) => {
  const ctx = fixture(t);
  lanePlan(ctx, TWO_LANES);
  mkdirSync(join(ctx.laneRoot, "reviews"), { recursive: true });
  const r = sg(ctx, ["dispatch", "--apply"]);
  assert.equal(r.code, 2);
  assert.match(r.err, /repo-lanes\/reviews already exists and is not a worktree of this repository/);
  assert.deepEqual(branches(ctx), ["main"]);
  rmSync(join(ctx.laneRoot, "reviews"), { recursive: true, force: true });
  git(ctx.dir, "worktree", "add", "-q", join(ctx.laneRoot, "reviews"), "-b", "other");
  const busy = sg(ctx, ["dispatch", "--apply"]);
  assert.equal(busy.code, 2);
  assert.match(busy.err, /is already a worktree of this repository on branch other/);
  rmSync(join(ctx.laneRoot, "reviews"), { recursive: true, force: true });
  const stale = sg(ctx, ["dispatch", "--apply"]);
  assert.equal(stale.code, 2);
  assert.match(stale.err, /registered as a worktree on branch other although the folder is gone; run git worktree prune/);
});

test("the lane plan's problems are reported together: no branch field, an unknown field, a duplicate name", (t) => {
  const ctx = fixture(t);
  lanePlan(ctx, `Base commit: {base}

## Lane: reviews   model: sonnet
N1. one

## Lane: reviews   branch: lane/reviews-0920   window: 120000
N2. two

## Lane: billing   branch: lane/reviews-0920
N3. three
`);
  const r = sg(ctx, ["dispatch"]);
  assertNothingCreated(ctx, r);
  assert.match(r.err, /4 problems in the lane plan, so no worktree was created:$/m);
  assert.match(r.err, /lane reviews has no branch field\. Write: ## Lane: reviews {3}branch: lane\/reviews-<mmdd>/);
  assert.match(r.err, /lane reviews has the unknown field "window" \(known: branch, model, context ceiling\)/);
  assert.match(r.err, /the lane name reviews is used twice \(lines 3 and 6\)/);
  assert.match(r.err, /the branch lane\/reviews-0920 is used by two lanes \(lines 6 and 9\)/);
});

test("a base commit the repository does not have is refused, and a plan with no base uses HEAD and says so", (t) => {
  const ctx = fixture(t);
  lanePlan(ctx, `Base commit: 0123456789abcdef0123456789abcdef01234567

## Lane: reviews   branch: lane/reviews-0920
N1. one
`);
  const missing = sg(ctx, ["dispatch"]);
  assertNothingCreated(ctx, missing);
  assert.match(missing.err, /the base commit 0123456789abcdef0123456789abcdef01234567 is not in this repository/);
  lanePlan(ctx, `## Lane: reviews   branch: lane/reviews-0920
N1. one
`);
  const head = sg(ctx, ["dispatch"]);
  assert.equal(head.code, 0, head.err);
  assert.match(head.out, new RegExp(`base commit:\\s+${ctx.head.slice(0, 12)} \\(the checked-out HEAD, because LANES\\.md names no base commit\\)`));
});

test("a missing plan, a plan with no lanes, and a lane root inside the repository are refused", (t) => {
  const ctx = fixture(t);
  const none = sg(ctx, ["dispatch"]);
  assert.equal(none.code, 2);
  assert.match(none.err, /LANES\.md does not exist, so there is no lane plan to dispatch/);
  assert.match(none.err, /\/workflow:dispatch/);
  writeFileSync(join(ctx.dir, "LANES.md"), "Base commit: abc1234\n\nNo lanes here.\n");
  const empty = sg(ctx, ["dispatch"]);
  assert.equal(empty.code, 2);
  assert.match(empty.err, /has no lane headings, so there is nothing to create/);
  lanePlan(ctx, TWO_LANES);
  mkdirSync(join(ctx.dir, ".skilliton"), { recursive: true });
  writeFileSync(join(ctx.dir, ".skilliton", "config.json"), `${JSON.stringify({ dispatch: { laneRoot: "lanes" } }, null, 2)}\n`);
  const inside = sg(ctx, ["dispatch"]);
  assert.equal(inside.code, 2);
  assert.match(inside.err, /the lane root is .*repo\/lanes, which is inside this repository/);
  assert.match(inside.err, /for example \.\.\/repo-lanes/);
});

test("--apply and --preview together are refused, and a plain argument is refused", (t) => {
  const ctx = fixture(t);
  lanePlan(ctx, TWO_LANES);
  const both = sg(ctx, ["dispatch", "--apply", "--preview"]);
  assert.equal(both.code, 2);
  assert.match(both.err, /--apply and --preview ask for opposite things/);
  const plain = sg(ctx, ["dispatch", "lanes.md"]);
  assert.equal(plain.code, 2);
  assert.match(plain.err, /dispatch takes no plain arguments \(got "lanes\.md"\); the lane plan is LANES\.md, or --file <path>/);
  assert.equal(existsSync(ctx.laneRoot), false);
});

test("--file reads another plan, and a lane with no items says so instead of guessing", (t) => {
  const ctx = fixture(t);
  writeFileSync(join(ctx.dir, "batch-2.md"), `Base commit: ${ctx.head}

## Lane: docs   branch: lane/docs-0920
`);
  const r = sg(ctx, ["dispatch", "--file", "batch-2.md", "--apply"]);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^skilliton dispatch: 1 lane from batch-2\.md$/m);
  assert.match(r.out, /^ {4}items:\s+none named in batch-2\.md; the brief says so instead of guessing$/m);
  const brief = readFileSync(join(ctx.laneRoot, "docs", "LANE_BRIEF.md"), "utf8");
  assert.match(brief, /^## Scope: 0 items$/m);
  assert.match(brief, /^LANES\.md names no items for this lane\. Do not guess the scope: say so and stop\.$/m);
  assert.match(brief, /Written by `skilliton dispatch` from batch-2\.md on \d{4}-\d{2}-\d{2}/);
});

test("an empty mainOnlyPaths and an unset lane check are said plainly, in the plan and in the brief", (t) => {
  const ctx = fixture(t, { config: { dispatch: { mainOnlyPaths: [] } } });
  lanePlan(ctx, TWO_LANES);
  const r = sg(ctx, ["dispatch", "--apply"]);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^ {2}main-only:\s+none set \(dispatch\.mainOnlyPaths is empty\); each brief says so$/m);
  const brief = readFileSync(join(ctx.laneRoot, "reviews", "LANE_BRIEF.md"), "utf8");
  assert.match(brief, /This project sets no main-only paths/);
  assert.match(brief, /This project names no lane test command/);
  assert.match(brief, /^None: this project sets no `dispatch\.laneSetup` commands\.$/m);
});

test("an invalid dispatch section is refused by the configuration, naming the key", (t) => {
  const ctx = fixture(t, { config: { dispatch: { mainOnlyPaths: "docs/", maxItemsPerLane: 0, laneWidth: 3 } } });
  lanePlan(ctx, TWO_LANES);
  const r = sg(ctx, ["dispatch"]);
  assert.equal(r.code, 2);
  assert.match(r.err, /dispatch\.mainOnlyPaths must be a list of non-empty strings/);
  assert.match(r.err, /dispatch\.maxItemsPerLane must be a whole number from 1 to 100/);
  assert.match(r.err, /dispatch has the unknown key "laneWidth"/);
});

test("a repository with no commits is refused, because a lane has nothing to branch from", (t) => {
  const ctx = fixture(t, { commits: 0 });
  writeFileSync(join(ctx.dir, "LANES.md"), "## Lane: reviews   branch: lane/reviews-0920\nN1. one\n");
  const r = sg(ctx, ["dispatch"]);
  assert.equal(r.code, 2);
  assert.match(r.err, /this repository has no commits yet, so a lane has nothing to branch from/);
});

test("the plan is read only up to a bound, because a lane plan is a page per lane", (t) => {
  const ctx = fixture(t);
  writeFileSync(join(ctx.dir, "LANES.md"), `${TWO_LANES}\n${"x".repeat(200001)}\n`);
  const r = sg(ctx, ["dispatch"]);
  assert.equal(r.code, 2);
  assert.match(r.err, /LANES\.md is \d+ KB, over the 195 KB dispatch reads/);
});
