// audit-install.mjs: the pre-push hook, and the scope a push actually carries.
//
// docs/LESSONS.md, 2026-09-16: a pre-push scan over `git rev-list --all` reported a file nobody in that session had
// written, because --all reaches every local branch and this machine keeps other sessions' worktrees beside each
// other. The scope here is the four fields git feeds the hook on standard input and nothing else. That is the lesson
// written as code, and it is why prePushScopes is a pure function over those lines plus a git runner: the part that
// decides what gets read can be tested without pushing anything.
//
// It reports and never rejects. The delivery gate is the sibling that refuses (lib/delivery.mjs), and it fails closed
// on purpose because a shared branch is the last place a finding can be caught. A pre-push hook sits on a person's
// own machine, where a hook that blocks a push teaches the person to pass --no-verify, and a hook everybody skips
// gates nothing. So this one prints and exits 0, including when it could not run at all, which it says out loud.

import { chmodSync, lstatSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { backupFile, newStamp, refuse } from "./core.mjs";
import { OperationFailed } from "./prepare.mjs";

const HOOK_MARKER = "# skilliton:audit-pre-push v1";
const HOOK_MARKER_RE = /^# skilliton:audit-pre-push v\d+[ \t]*$/m;
const RUNTIME_KEY = "skilliton.auditRuntime";
const ZERO = /^0+$/;

// The hook. It reads the runtime path from this repository's git config at push time, the way the delivery hook does,
// so the file is the same on every machine and "already current" means something.
function hookScript() {
  return [
    "#!/bin/sh",
    HOOK_MARKER,
    "# Written by `skilliton audit install --pre-push`; run install again instead of editing this file. Git runs this",
    "# hook before a push, with one \"<local ref> <local sha> <remote ref> <remote sha>\" line per ref on standard",
    "# input. Those lines go to the audit, which reads only the range each one names and prints what is worth a",
    "# person's attention. It never stops a push: when it cannot run it says so and still exits 0.",
    "",
    "note() { printf 'skilliton audit: %s\\n' \"$1\" >&2; }",
    "",
    "runtime=$(git config --get " + RUNTIME_KEY + " 2>/dev/null) || runtime=",
    "if [ -z \"$runtime\" ]; then",
    "  note \"" + RUNTIME_KEY + " is not set in this repository's git config, so this push was not audited; run skilliton audit install --pre-push again\"",
    "  exit 0",
    "fi",
    "if [ ! -f \"$runtime\" ] || [ ! -x \"$runtime\" ]; then",
    "  note \"the runtime $runtime is missing or not executable, so this push was not audited\"",
    "  exit 0",
    "fi",
    "if ! command -v node >/dev/null 2>&1; then",
    "  note \"node was not found on PATH, so this push was not audited\"",
    "  exit 0",
    "fi",
    "\"$runtime\" audit --pre-push",
    "status=$?",
    "[ \"$status\" -eq 3 ] && note \"the audit could not finish, so part of this push was not audited\"",
    "exit 0",
    "",
  ].join("\n");
}

const lstatOrNull = (path) => { try { return lstatSync(path); } catch (e) { if (e.code === "ENOENT" || e.code === "ENOTDIR") return null; throw e; } };
const canonicalFile = (path) => { try { return join(dirname(resolve(path)), basename(path)); } catch { return resolve(path); } };

// Everything install would do, decided before anything is written. Throws Refused (exit 2) for any refusal.
export function planPrePush({ root, git, runtime }) {
  const hooksPath = git(["rev-parse", "--git-path", "hooks/pre-push"]).stdout.toString("utf8").trim();
  const hookPath = resolve(root, hooksPath);
  const configured = git(["config", "--get", "core.hooksPath"], { allowFailure: true });
  if (configured.status === 0 && configured.stdout.toString("utf8").trim()) {
    refuse(`git runs this repository's hooks from ${configured.stdout.toString("utf8").trim()} (core.hooksPath is set), so a hook written elsewhere would never run. Unset core.hooksPath for this repository, then run install again.`);
  }
  const hookText = hookScript();
  const now = lstatOrNull(hookPath);
  let hookAction = "create";
  if (now) {
    if (!now.isFile()) refuse(`${hookPath} exists and is not a regular file; move it away by hand first.`);
    const text = readFileSync(hookPath, "utf8");
    if (!HOOK_MARKER_RE.test(text)) {
      refuse(`${hookPath} already exists and was not written by skilliton audit install (it has no "${HOOK_MARKER}" line); it was left untouched. Combine the two hooks by hand or move the existing one away, then run install again.`);
    }
    hookAction = text === hookText ? "unchanged" : "replace";
  }
  const from = git(["config", "--get", RUNTIME_KEY], { allowFailure: true });
  const currentRuntime = from.status === 0 ? from.stdout.toString("utf8").replace(/\n$/, "") : null;
  return { root, hookPath, hookAction, hookText, canonical: canonicalFile(hookPath), config: { key: RUNTIME_KEY, from: currentRuntime, to: runtime } };
}

export function describePrePush(plan) {
  const words = { create: "create", replace: "replace (the current file is backed up first)", unchanged: "already current, unchanged" };
  const c = plan.config;
  return [
    `hook:   ${plan.hookPath}: ${words[plan.hookAction]}`,
    `config: ${c.key} = ${c.to}${c.from === c.to ? " (unchanged)" : c.from === null ? " (not set before)" : ` (was ${c.from})`}`,
    "runs:   report only. A finding is printed and the push goes ahead; the merge gate is what refuses.",
  ];
}

// Writes the plan. The hook is checked again immediately before it is replaced, so a file that changed between the
// plan and the write is refused rather than overwritten.
export function applyPrePush(plan, { git, stamp = newStamp() } = {}) {
  let backup = null;
  if (plan.hookAction !== "unchanged") {
    const now = lstatOrNull(plan.hookPath);
    if (now && (!now.isFile() || !HOOK_MARKER_RE.test(readFileSync(plan.hookPath, "utf8")))) {
      refuse(`${plan.hookPath} changed after it was checked and is no longer a hook written by install; nothing was written.`);
    }
    if (!now && plan.hookAction === "replace") refuse(`${plan.hookPath} disappeared after it was checked; nothing was written. Run install again.`);
    if (now && plan.hookAction === "create") refuse(`${plan.hookPath} appeared after it was checked; nothing was written. Run install again.`);
    if (now) backup = backupFile("audit", plan.hookPath, stamp);
    mkdirSync(dirname(plan.hookPath), { recursive: true });
    const temp = join(dirname(plan.hookPath), `.pre-push.skilliton-${process.pid}`);
    writeFileSync(temp, plan.hookText, { mode: 0o755 });
    chmodSync(temp, 0o755);
    renameSync(temp, plan.hookPath);
  }
  if (plan.config.from !== plan.config.to) git(["config", plan.config.key, plan.config.to]);
  const written = statSync(plan.hookPath);
  if ((written.mode & 0o111) !== 0o111 || readFileSync(plan.hookPath, "utf8") !== plan.hookText) {
    throw new OperationFailed(`${plan.hookPath} was written but does not read back as the executable hook`);
  }
  return { backup };
}

// ---------- the scope a push carries ----------

// One entry per line git wrote on standard input, in order, each either a range to audit or a reason it is not one.
// Nothing here reaches beyond the refs the line names: no --all, no other branch, no working tree.
export function prePushScopes(text, { git }) {
  const scopes = [];
  for (const raw of String(text).split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const [localRef, localSha, remoteRef, remoteSha] = line.split(/\s+/);
    if (!localRef || !localSha || !remoteRef || !remoteSha) {
      scopes.push({ ref: line, skip: "the line is not the four fields a pre-push hook is given" });
      continue;
    }
    const at = { ref: remoteRef, local: localRef };
    if (ZERO.test(localSha)) { scopes.push({ ...at, skip: "the ref is being deleted, so there is nothing to read" }); continue; }
    const known = (sha) => !ZERO.test(sha) && git(["rev-parse", "--verify", "--quiet", `${sha}^{commit}`], { allowFailure: true }).status === 0;
    if (known(remoteSha)) { scopes.push({ ...at, base: remoteSha, head: localSha }); continue; }

    // The remote has no copy of this ref, or a copy this machine has never seen. The commits being pushed are the
    // ones no remote-tracking ref already holds; the base is the parent of the oldest of them, or the empty tree when
    // it is a root commit. When every commit is already on a remote, there is nothing new and the line is skipped.
    const listed = git(["rev-list", localSha, "--not", "--remotes"], { allowFailure: true });
    if (listed.status !== 0) { scopes.push({ ...at, skip: "the commits new to this push could not be listed" }); continue; }
    const commits = listed.stdout.toString("utf8").split("\n").filter(Boolean);
    if (!commits.length) { scopes.push({ ...at, skip: "every commit on this ref is already on a remote" }); continue; }
    const oldest = commits[commits.length - 1];
    const parent = git(["rev-parse", "--verify", "--quiet", `${oldest}^1^{commit}`], { allowFailure: true });
    const base = parent.status === 0 ? parent.stdout.toString("utf8").trim() : emptyTree(git);
    scopes.push({ ...at, base, head: localSha, newRef: true });
  }
  return scopes;
}

// The repository's own empty tree, asked for rather than written down, because a repository using SHA-256 has a
// different one and a hard-coded SHA-1 hash would silently name nothing there.
function emptyTree(git) {
  const r = git(["hash-object", "-t", "tree", "--stdin"], { input: "", allowFailure: true });
  if (r.status !== 0) throw new OperationFailed("the empty tree could not be named, so a first commit cannot be read");
  return r.stdout.toString("utf8").trim();
}
