#!/usr/bin/env node
// demo-day.mjs: the five steps of the demonstration, run end to end on disposable folders (docs/DEMO.md, backlog B14).
//
//   node scripts/demo-day.mjs                    run all five steps and print what each one shows
//   node scripts/demo-day.mjs --claude <path>    drive the real Claude Code for the machine setup step
//   node scripts/demo-day.mjs --step 3           stop after that step
//   node scripts/demo-day.mjs --keep             keep the workspace and print where it is, ready to show live
//
// A run that finishes removes its workspace unless --keep was given. A run that stops at a step, and a run stopped
// with Ctrl-C, leave it behind on purpose, and print where it is: this script runs one program after another, so it
// cannot tidy up after an interrupt.
//
// It works in a temporary folder, with throwaway keys and a home folder of its own: this repository is copied into it
// and never changed, your own configuration is neither read nor changed, and no model is used. Without --claude the two client commands are acted
// out by scripts/fixtures/clients/standin.mjs, and every line that came from it says so, because on the day those are
// the real Claude Code.
//
// A step that does not behave stops the run and prints what it saw. That is the point of running it before the day.

import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..");
const STANDIN = join(HERE, "fixtures", "clients", "standin.mjs");
const SAMPLE = join(HERE, "fixtures", "demo-app");
const COMPANY = "acme";
const MARKET = "acme-skills";

const argv = process.argv.slice(2);
const option = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
const KEEP = argv.includes("--keep");
const CLAUDE = option("--claude");
const LAST_STEP = Number(option("--step") ?? 5);
if (!Number.isInteger(LAST_STEP) || LAST_STEP < 1 || LAST_STEP > 5) {
  console.log(`--step takes a number from 1 to 5 (got ${JSON.stringify(option("--step"))})`);
  process.exit(2);
}

const ws = realpathSync(mkdtempSync(join(tmpdir(), "skilliton-demo-day-")));
const dirs = {
  home: join(ws, "home"), tools: join(ws, "tools"), keys: join(ws, "keys"),
  company: join(ws, "company-skills"), laptop: join(ws, "laptop"), product: join(ws, "intake-service"),
  shared: join(ws, "shared.git"), clone: join(ws, "developer-clone"),
};
for (const d of Object.values(dirs)) mkdirSync(d, { recursive: true });

const env = {
  PATH: `${dirs.tools}:${process.env.PATH ?? ""}`, HOME: dirs.home, LANG: process.env.LANG ?? "C.UTF-8",
  SKILLITON_SELF: "skilliton", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_AUTHOR_NAME: "Demo", GIT_AUTHOR_EMAIL: "demo@example.invalid", GIT_COMMITTER_NAME: "Demo", GIT_COMMITTER_EMAIL: "demo@example.invalid",
  CLAUDE_CONFIG_DIR: join(dirs.laptop, "claude"), SKILLITON_TRUST_DIR: join(dirs.laptop, "trust"),
  SKILLITON_JOIN_DIR: join(dirs.laptop, "joined"), SKILLITON_BACKUPS: join(dirs.laptop, "backups"),
  STANDIN_LOG: join(ws, "clients.log"),
};

// Every file and folder under a path, so a claim that nothing was written can be checked rather than said.
function listAll(dir, out = []) {
  for (const name of existsSync(dir) ? readdirSync(dir).sort() : []) {
    const path = join(dir, name);
    out.push(path);
    if (statSync(path).isDirectory()) listAll(path, out);
  }
  return out;
}

// A short name for a path inside the workspace, so the output reads as a place rather than as a long path.
const tildeish = (path) => path.replace(ws, "<workspace>");

let stepNumber = 0;
const say = (line = "") => console.log(line);
const heading = (title) => { stepNumber++; say(""); say(`${"=".repeat(78)}`); say(`STEP ${stepNumber}: ${title}`); say(`${"=".repeat(78)}`); };
const shows = (line) => say(`  shows | ${line}`);
const script = (line) => say(`  say   | ${line}`);

function stop(what, detail) {
  say("");
  say(`STOPPED at step ${stepNumber}: ${what}`);
  say(detail.split("\n").slice(-25).map((l) => `  ${l}`).join("\n"));
  say("");
  say(`The workspace is kept for you to look at: ${ws}`);
  say(`When you have finished with it: rm -rf ${ws}`);
  process.exit(1);
}

function run(file, args, { cwd = ws, input, expect = [0], label } = {}) {
  const r = spawnSync(file, args, { cwd, env, input, encoding: "utf8", timeout: 300000 });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  const shown = label ?? `${file.split("/").pop()} ${args.join(" ")}`;
  if (r.error) stop(`${shown} could not run`, `${r.error.code ?? r.error.message}`);
  if (expect !== null && !expect.includes(r.status)) stop(`${shown} exited ${r.status}, expected ${expect.join(" or ")}`, out);
  return { code: r.status, out };
}

const cli = (args, options = {}) => run(process.execPath, [join(dirs.company, "scripts", "skilliton.mjs"), ...args], options);
const git = (cwd, ...args) => run("git", ["-C", cwd, ...args], { label: `git ${args[0]}` });
const first = (out, re) => out.split("\n").find((l) => re.test(l))?.trim() ?? "";
// Shows a line the command actually printed. When the line is not there, the step stops: a demonstration that prints
// a sentence its own output does not carry is the thing this script exists to catch before the day.
function showsLine(out, re, what) {
  const line = first(out, re);
  if (!line) stop(`${what}: the output does not carry the line this step is about (${re})`, out);
  shows(line);
  return line;
}

// ---------------------------------------------------------------- the stage

const client = { path: CLAUDE, real: Boolean(CLAUDE) };
if (!client.real) {
  for (const name of ["claude", "codex"]) {
    writeFileSync(join(dirs.tools, name), `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(STANDIN)} ${name} "$@"\n`);
    chmodSync(join(dirs.tools, name), 0o755);
  }
} else if (!existsSync(client.path)) {
  stop("--claude does not name a file", client.path);
}

say("Skilliton demonstration, the five steps, on disposable folders.");
say(client.real ? `Claude Code: ${client.path} (the real one)` : "Claude Code: a stand-in (scripts/fixtures/clients/standin.mjs), because --claude was not given");
say(`Workspace: ${ws}`);

// ------------------------------------------------------- 1. the company package

heading("The company package: a fork made its own, with one company skill and a signed release");
script("This is the company's own copy. Everything a developer's machine will run comes from here.");

cpSync(REPO, dirs.company, { recursive: true, filter: (src) => !src.includes("/.git/") && !src.endsWith("/.git") && !src.includes("/node_modules/") && !src.includes("/evidence/") });
git(dirs.company, "init", "-q", "-b", "main");
git(dirs.company, "add", "-A");
git(dirs.company, "commit", "-q", "-m", "the company's copy of the skills repository");

const init = cli(["company", "init", "--name", COMPANY, "--marketplace-name", MARKET, "--marketplace-repo", `${COMPANY}/skills`, "--repo", dirs.company, "--apply"]);
showsLine(init.out, /marketplace/i, "company init");
const plugin = cli(["new-plugin", "review-rules", "--pack", COMPANY, "--description", "The review rules this company expects every change to follow.", "--repo", dirs.company, "--apply"]);
showsLine(plugin.out, /plugin\.json|created/i, "new-plugin");
const skill = cli(["new-skill", "review-rules", "billing-review", "--pack", COMPANY, "--description", "How this company reviews a change that touches billing.", "--repo", dirs.company]);
const skillFile = join(dirs.company, "packs", COMPANY, "plugins", "review-rules", "skills", "billing-review", "SKILL.md");
if (!existsSync(skillFile)) stop("new-skill did not write the skill", skill.out);
shows(`new-skill: created packs/${COMPANY}/plugins/review-rules/skills/billing-review/SKILL.md`);
script("Nothing here is ours. It is their marketplace name, their plugin, their skill.");

git(dirs.company, "add", "-A");
git(dirs.company, "commit", "-q", "-m", "the company's own review rules");
const release = cli(["release", "create", "--version", "1.0.0", "--repo", dirs.company, "--apply"]);
showsLine(release.out, /releases\/1\.0\.0\.json|manifest/i, "release create");
git(dirs.company, "add", "-A");
git(dirs.company, "commit", "-q", "-m", "release 1.0.0");

run("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-C", "approver@example.invalid", "-f", join(dirs.keys, "approver")]);
const pub = readFileSync(join(dirs.keys, "approver.pub"), "utf8").trim().split(/\s+/).slice(0, 2).join(" ");
writeFileSync(join(dirs.keys, "allowed_signers"), `approver@example.invalid namespaces="git" ${pub}\n`);
git(dirs.company, "config", "gpg.format", "ssh");
git(dirs.company, "config", "user.signingkey", join(dirs.keys, "approver"));
cli(["trust", "add", "--company", COMPANY, "--signers", join(dirs.keys, "allowed_signers"), "--apply"]);
const sign = cli(["release", "sign", "1.0.0", "--repo", dirs.company, "--apply"]);
showsLine(sign.out, /signed|tag/i, "release sign");
const list = cli(["release", "list", "--company", COMPANY, "--repo", dirs.company]);
if (!/^\s*approved\s+1\.0\.0\b/m.test(list.out)) stop("release list does not show 1.0.0 as approved", list.out);
showsLine(list.out, /^\s*approved\s+1\.0\.0\b/, "release list");
script("A release is approved by a signature, not by a message in a chat.");
if (stepNumber >= LAST_STEP) finish();

// ------------------------------------------------------------- 2. a new laptop

heading("A new laptop: one command, ending VERIFIED");
script("This is a machine that has never seen any of this. One command sets it up.");
const joinArgs = ["join", "--company", COMPANY, "--signers", join(dirs.keys, "allowed_signers"), "--marketplace", dirs.company,
  "--client", "claude-code", "--bin-dir", join(dirs.laptop, "bin"), ...(client.real ? ["--claude", client.path] : [])];
// The claim after the preview is checked, not asserted: the laptop must hold exactly what it held before it ran.
const before = listAll(dirs.laptop);
const preview = cli([...joinArgs, "--repo", dirs.company]);
const planned = /(\d+) change\(s\) to make/.exec(preview.out);
if (!planned || Number(planned[1]) === 0) stop("the join preview does not say what it would change", preview.out);
const added = listAll(dirs.laptop).filter((path) => !before.includes(path));
if (added.length) stop("the join preview wrote something", `it added ${added.slice(0, 5).join(", ")} in ${dirs.laptop}`);
shows(`${planned[1]} change(s) it would make, and not one file written in ${tildeish(dirs.laptop)}`);
script("It shows what it would do first. Nothing is written yet.");
const applied = cli([...joinArgs, "--repo", dirs.company, "--apply"], { expect: [0, 1] });
for (const line of applied.out.split("\n").filter((l) => /^(machine checks|verify|wrote|trusted|Claude Code:)/.test(l.trim())).slice(0, 6)) shows(line.trim());
if (!/VERIFIED/.test(applied.out)) stop("join did not end with a VERIFIED plugin", applied.out);
script(client.real
  ? "VERIFIED means: every file of every installed plugin matches the release the approver signed."
  : "VERIFIED means: every file matches the signed release. (Here a stand-in acted out the two Claude Code commands; on the day this is the real Claude Code.)");
if (stepNumber >= LAST_STEP) finish();

// ------------------------------------------------------ 3. the product repository

heading("The product repository: one reviewable commit");
script("Now their own codebase. This is a sample application, never the audience's own code.");
cpSync(SAMPLE, dirs.product, { recursive: true });
git(dirs.product, "init", "-q", "-b", "main");
git(dirs.product, "add", "-A");
git(dirs.product, "commit", "-q", "-m", "the intake service as it is today");
const tests = run("npm", ["test", "--silent"], { cwd: dirs.product, expect: [0], label: "npm test" });
showsLine(tests.out, /pass \d+/, "the sample application's tests");

const prepare = cli(["prepare", "--dir", dirs.product], { expect: [0, 1] });
const summary = /Summary: (\d+) to create, (\d+) to update/.exec(prepare.out);
if (!summary || Number(summary[1]) === 0) stop("the prepare preview does not say how many files it would create", prepare.out);
shows(`${summary[1]} file(s) it would add and ${summary[2]} it would change, shown before anything is written`);
cli(["prepare", "--dir", dirs.product, "--apply"], { expect: [0, 1] });
git(dirs.product, "add", "-A");
git(dirs.product, "commit", "-q", "-m", "prepare this repository for Skilliton");
const changed = run("git", ["-C", dirs.product, "show", "--stat", "--format=", "HEAD"], { label: "git show" });
showsLine(changed.out, /files? changed/, "the one commit prepare makes");
script("One commit. Records, an instruction block, settings, a security register. Nothing hidden.");
if (stepNumber >= LAST_STEP) finish();

// ----------------------------------------------------------- 4. a developer session

heading("A developer session: what the tool shows, and what it refuses");
script("This is what a developer sees when they open the project.");
const sessionStart = run(join(dirs.company, "packs", "base", "plugins", "workflow", "bin", "skilliton"), ["hook", "session-start"], {
  cwd: dirs.product, input: JSON.stringify({ session_id: "demo", cwd: dirs.product, hook_event_name: "SessionStart" }), expect: [0],
});
for (const line of sessionStart.out.split("\n").filter(Boolean).slice(0, 6)) shows(line.trim());
const task = cli(["task", "start", "Add a telephone field to the form", "--criteria", "The field is optional and is checked like the others", "--dir", dirs.product, "--apply"]);
showsLine(task.out, /created docs\/tasks/, "task start");

const guard = run("bash", [join(dirs.company, "packs", "base", "plugins", "guardrails", "hooks", "guard-bash.sh")], {
  cwd: dirs.product, expect: [0], label: "the guardrails hook",
  input: JSON.stringify({ session_id: "demo", cwd: dirs.product, hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "git push --force origin main" } }),
});
if (!/"permissionDecision":"deny"/.test(guard.out)) stop("the guardrails hook did not block a force-push to a protected branch", guard.out);
// The reason is the line the room reads, so a run that cannot find one has not rehearsed this step. Printing "deny"
// instead would put a sentence on the screen that no hook wrote.
const guardReason = /"permissionDecisionReason":"([^"]{0,150})/.exec(guard.out)?.[1];
if (!guardReason) stop("the guardrails hook blocked the push but gave no reason to show, and the reason is what this step shows", guard.out);
shows(`the guardrails hook answered: ${guardReason.slice(0, 150)}...`);
script("Nobody asked it to be careful. The rule is in the plugin the company released.");
script("On the day, this step is a real Claude Code session in this folder: the same project state, the same refusal.");
if (stepNumber >= LAST_STEP) finish();

// -------------------------------------------------------------- 5. the merge check

heading("The merge check: a change that passes alone and breaks once combined");
script("Two developers, one shared branch. Each change passes on its own.");
run("git", ["init", "-q", "--bare", "-b", "main", dirs.shared], { label: "git init --bare" });
git(dirs.product, "remote", "add", "origin", dirs.shared);
writeFileSync(join(dirs.product, ".skilliton", "delivery.json"), `${JSON.stringify({
  schema: "skilliton.delivery/1", protectedBranches: ["main"], policyPaths: [".skilliton/delivery.json"],
  checks: [{ name: "tests", command: ["npm", "test", "--silent"], timeoutSeconds: 300 }],
}, null, 2)}\n`);
git(dirs.product, "add", "-A");
git(dirs.product, "commit", "-q", "-m", "the checks this branch requires");
git(dirs.product, "push", "-q", "origin", "main");
const install = cli(["delivery", "install", "--bare", dirs.shared, "--approvers", join(dirs.keys, "allowed_signers"),
  "--runtime", join(dirs.company, "packs", "base", "plugins", "workflow", "bin", "skilliton"), "--apply"]);
showsLine(install.out, /pre-receive|installed/i, "delivery install");

// One developer renames a field's rule; the other adds a test that uses the old name. Each passes alone.
writeFileSync(join(dirs.product, "src", "validate.mjs"), readFileSync(join(dirs.product, "src", "validate.mjs"), "utf8").replace('message: { label: "message"', 'message: { label: "note"'));
git(dirs.product, "add", "-A");
git(dirs.product, "commit", "-q", "-m", "call the message field a note, as the form does");
run("npm", ["test", "--silent"], { cwd: dirs.product, expect: [1], label: "npm test after the rename" });
shows("that change alone: the sample application's own tests now fail, so the developer fixes them");
writeFileSync(join(dirs.product, "test", "intake.test.mjs"), readFileSync(join(dirs.product, "test", "intake.test.mjs"), "utf8").replace("The message is missing.", "The note is missing."));
git(dirs.product, "add", "-A");
git(dirs.product, "commit", "-q", "-m", "the tests follow the new name");
run("npm", ["test", "--silent"], { cwd: dirs.product, expect: [0], label: "npm test after the fix" });
shows("with the tests updated, the change passes on its own");

const other = join(ws, "other-developer");
run("git", ["clone", "-q", dirs.shared, other], { label: "git clone" });
writeFileSync(join(other, "test", "message.test.mjs"), `import { test } from "node:test";\nimport assert from "node:assert/strict";\nimport { validate } from "../src/validate.mjs";\n\ntest("a missing message is named", () => {\n  assert.deepEqual(validate({ name: "A", email: "a@example.invalid" }), ["The message is missing."]);\n});\n`);
git(other, "add", "-A");
git(other, "commit", "-q", "-m", "test that a missing message is named");
run("npm", ["test", "--silent"], { cwd: other, expect: [0], label: "npm test for the other developer" });
shows("the other developer's change also passes on its own");
git(other, "push", "-q", "origin", "main");

// The first developer brings the other's work in, as anyone would before pushing: the merge itself is clean, because
// the two changed different files. Only the result of the two together fails.
git(dirs.product, "fetch", "-q", "origin");
git(dirs.product, "merge", "-q", "--no-edit", "origin/main");
shows("the first developer merges the other's work: no conflict, because they changed different files");
const combined = run("npm", ["test", "--silent"], { cwd: dirs.product, expect: [1], label: "npm test on the combined result" });
// The same rule as the hook's reason: the failing test's own words are the evidence. A sentence written here
// instead would be the script telling the room what happened, not the run.
const failure = first(combined.out, /note is missing|message is missing|fail \d+/);
if (!failure) stop("the combined result failed as expected, but the failing test's own words could not be found to show", combined.out);
shows(`together, the tests fail: ${failure}`);

const push = run("git", ["-C", dirs.product, "push", "origin", "main"], { expect: null, label: "git push" });
if (push.code === 0) stop("the shared repository accepted a push whose combined result breaks the tests", push.out);
if (!/skilliton delivery: rejected/.test(push.out)) stop("the push was rejected by git itself, not by the delivery gate, so this step would show the wrong thing", push.out);
showsLine(push.out, /skilliton delivery: rejected/i, "the gate's rejection");
for (const line of push.out.split("\n").filter((l) => /remote:/.test(l)).slice(0, 4)) shows(line.trim());
script("Neither change is wrong. Together they break the build, and the shared branch is the thing that noticed.");
script("This is the part that does not depend on anyone being careful.");
finish();

function finish() {
  say("");
  say(`${"=".repeat(78)}`);
  say(`Ran ${stepNumber} step(s) of 5.${client.real ? "" : " The two Claude Code commands were acted out by a stand-in."}`);
  say("What this run does not show: device management placing the files with nobody typing anything (B22), the merge");
  say("check running on GitHub itself (B4), any endpoint-security product (B29), Windows (B30), and any time or cost");
  say("saving. The talk track is docs/DEMO.md.");
  if (KEEP) say(`Workspace kept: ${ws}`);
  else rmSync(ws, { recursive: true, force: true });
  process.exit(0);
}
