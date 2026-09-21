// delivery-install.mjs: writing the gate into a shared bare repository, and nothing about deciding a push.
//
// Taken out of lib/delivery.mjs, which had reached the ceiling scripts/lint.test.mjs holds it to. The split follows
// the same line as lib/delivery-policy.mjs: this file only ever runs when a person types `delivery install`, and no
// gate decision reaches it. It depends on lib/delivery.mjs for the repository readers it shares with the gate, and
// lib/delivery.mjs never depends on this file, so the hook can be read without reading the gate.
//
// The contract is docs/CONTRACTS.md section 14; the plain-language guide is docs/DELIVERY.md.

import {
  accessSync, chmodSync, constants as fsConstants, lstatSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { argPath, backupFile, isDir, newStamp, refuse, runProgram } from "./core.mjs";
import { DeliveryError, bareView, gitRunner, protectionFor } from "./delivery.mjs";
import { POLICY_FILE, readApproversFile } from "./delivery-policy.mjs";
import { LEGACY_DELIVERY_CONFIG_KEYS, LEGACY_DELIVERY_HOOK_MARKER } from "./legacy-names.mjs";

const HOOK_MARKER = "# skilliton:delivery-hook v1";
const HOOK_MARKER_RE = /^# skilliton:delivery-hook v\d+[ \t]*$/m;

// The pre-receive hook. It reads the runtime path from the repository's git config at push time and fails closed.
function hookScript() {
  return [
    "#!/bin/sh",
    HOOK_MARKER,
    "# Written by `skilliton delivery install`; run install again instead of editing this file. Git runs this hook before",
    "# it updates any ref in this repository, with one \"<old> <new> <ref>\" line per update on standard input. The lines",
    "# go to the Skilliton delivery gate, and the hook exits with the gate's status: anything but 0 rejects the whole",
    "# push. It fails closed: when the runtime, its setting or node is missing, the push is rejected.",
    "",
    "reject() {",
    "  printf 'skilliton delivery: rejected: %s\\n' \"$1\"",
    "  exit 1",
    "}",
    "repo=$(cd \"${GIT_DIR:-.}\" 2>/dev/null && pwd -P) || reject \"cannot resolve the repository folder\"",
    "runtime=$(git config --get skilliton.runtime 2>/dev/null) || runtime=",
    "[ -n \"$runtime\" ] || reject \"skilliton.runtime is not set in this repository's git config; run skilliton delivery install again\"",
    "[ -f \"$runtime\" ] && [ -x \"$runtime\" ] || reject \"the delivery runtime $runtime is missing or not executable\"",
    "command -v node >/dev/null 2>&1 || reject \"node was not found on PATH, so the delivery checks cannot run\"",
    "\"$runtime\" delivery gate --bare \"$repo\"",
    "status=$?",
    "if [ \"$status\" -ne 0 ]; then",
    "  [ \"$status\" -eq 1 ] || printf 'skilliton delivery: rejected: the delivery gate exited with status %s\\n' \"$status\"",
    "  exit \"$status\"",
    "fi",
    "exit 0",
    "",
  ].join("\n");
}

function lstatOrNull(path) {
  try { return lstatSync(path); } catch (e) { if (e.code === "ENOENT" || e.code === "ENOTDIR") return null; throw e; }
}

function canonicalFile(path) {
  try { return join(realpathSync(dirname(path)), basename(path)); } catch { return resolve(path); }
}

function configValue(git, key) {
  const r = git(["config", "--get", key], { allowExit: [0, 1] });
  return r.status === 0 ? r.stdout.replace(/\n$/, "") : null;
}

// Everything install would do, checked before anything is written. Throws Refused (exit 2) for any refusal.
export function planInstall({ bare, approvers, runtime, defaultRuntime }) {
  if (!bare) refuse("--bare <repo.git> is required: the shared bare repository to protect");
  if (!approvers) refuse("--approvers <file> is required: an ssh allowed_signers file with the keys that may approve policy changes");
  const bareDir = resolve(bare);
  if (!isDir(bareDir)) refuse(`--bare ${bareDir} is not an existing folder`);
  const git = gitRunner(["--git-dir", bareDir]);
  const isBare = git(["rev-parse", "--is-bare-repository"], { allowExit: "any" });
  if (isBare.status !== 0 || isBare.stdout.trim() !== "true") refuse(`${bareDir} is not a bare git repository`);

  const hookPath = join(bareDir, "hooks", "pre-receive");
  const effective = resolve(bareDir, git(["rev-parse", "--git-path", "hooks/pre-receive"]).stdout.trim());
  if (canonicalFile(effective) !== canonicalFile(hookPath)) {
    refuse(`git runs this repository's hooks from ${dirname(effective)} (core.hooksPath is set), so a hook written to ${dirname(hookPath)} would never run. Unset core.hooksPath for this repository, then run install again.`);
  }
  const head = bareView(git).defaultBranch();
  if (!head) refuse(`the repository's HEAD does not name a default branch; set it first, for example: git --git-dir ${argPath(bareDir)} symbolic-ref HEAD refs/heads/main`);

  const approversPath = resolve(approvers);
  const found = readApproversFile(approversPath);
  if (found.problems) refuse(`the approvers file ${approversPath} ${found.problems.join("; ")}`);

  const runtimePath = resolve(runtime ?? defaultRuntime);
  const rst = lstatOrNull(runtimePath) && statSync(runtimePath, { throwIfNoEntry: false });
  if (!rst || !rst.isFile()) refuse(`the runtime ${runtimePath} is not a file (--runtime names the bin/skilliton launcher of the workflow plugin)`);
  try { accessSync(runtimePath, fsConstants.X_OK); } catch { refuse(`the runtime ${runtimePath} is not executable`); }
  const probe = runProgram(runtimePath, ["delivery", "--help"], 60000);
  if (!probe.ok) refuse(`the runtime ${runtimePath} failed to run "delivery --help" (${probe.failure}); a hook using it would reject every push`);

  const hookText = hookScript();
  const existing = lstatOrNull(hookPath);
  let hookAction = "create";
  if (existing) {
    if (!existing.isFile()) refuse(`${hookPath} exists but is not a regular file; it was left untouched`);
    const text = readFileSync(hookPath, "utf8");
    if (!HOOK_MARKER_RE.test(text) && LEGACY_DELIVERY_HOOK_MARKER.test(text)) {
      refuse(`${hookPath} was written by delivery install before the rename to Skilliton; it was left untouched, because it runs the runtime named in the git settings ${LEGACY_DELIVERY_CONFIG_KEYS.join(" and ")}. To replace it: move the hook out of the hooks folder, remove those two settings (git config --unset ${LEGACY_DELIVERY_CONFIG_KEYS[0]}; git config --unset ${LEGACY_DELIVERY_CONFIG_KEYS[1]}), then run install again. Until then the shared branch keeps the earlier gate.`);
    }
    if (!HOOK_MARKER_RE.test(text)) {
      refuse(`${hookPath} already exists and was not written by skilliton delivery install (it has no "${HOOK_MARKER}" line); it was left untouched. Combine the two hooks by hand or move the existing one away, then run install again.`);
    }
    hookAction = text === hookText && (existing.mode & 0o111) === 0o111 ? "unchanged" : "replace";
  }

  const config = [["skilliton.approvers", approversPath], ["skilliton.runtime", runtimePath]]
    .map(([key, to]) => ({ key, from: configValue(git, key), to }));

  const notes = [];
  const protection = protectionFor(git, bareView(git));
  if (protection.error) notes.push(`attention: ${protection.error}. Every push will be rejected until the policy on ${head} is fixed outside the gate.`);
  else if (!bareView(git).tip(head)) notes.push(`the default branch ${head} does not exist yet: the push that creates it must contain ${POLICY_FILE} and have its tip commit signed by an approver`);
  else if (!protection.policy) notes.push(`attention: the default branch ${head} has no ${POLICY_FILE}, so every push to ${head} will be rejected ("no delivery policy on the protected branch"). The gate accepts a new policy only on a branch it creates; add the policy to ${head} before installing the hook.`);
  else {
    const p = protection.policy;
    notes.push(`the policy on ${head} protects ${p.protectedBranches.length ? p.protectedBranches.join(", ") : "no branches"}; checks: ${p.checks.length ? p.checks.map((c) => c.name).join(", ") : "none"}`);
  }
  return { bare: bareDir, hookPath, hookText, hookAction, config, notes, defaultBranch: head };
}

export function describeInstall(plan) {
  const lines = [];
  const hookWords = { create: "create", replace: "replace (the current file is backed up first)", unchanged: "already current, unchanged" };
  lines.push(`hook:   ${plan.hookPath}: ${hookWords[plan.hookAction]}`);
  for (const c of plan.config) {
    lines.push(`config: ${c.key} = ${c.to}${c.from === c.to ? " (unchanged)" : c.from === null ? " (not set before)" : ` (was ${c.from})`}`);
  }
  for (const note of plan.notes) lines.push(`policy: ${note}`);
  return lines;
}

// Writes the plan. The hook is checked again right before it is replaced, and written last, so a failure part way
// leaves either no new hook or a hook that rejects pushes, never an unprotected half state.
export function applyInstall(plan, { stamp = newStamp() } = {}) {
  const now = lstatOrNull(plan.hookPath);
  let backup = null;
  if (plan.hookAction !== "unchanged") {
    if (now && (!now.isFile() || !HOOK_MARKER_RE.test(readFileSync(plan.hookPath, "utf8")))) {
      refuse(`${plan.hookPath} changed after it was checked and is no longer a hook written by install; nothing was written`);
    }
    if (!now && plan.hookAction === "replace") refuse(`${plan.hookPath} disappeared after it was checked; nothing was written. Run install again.`);
    if (now && plan.hookAction === "create") refuse(`${plan.hookPath} appeared after it was checked; nothing was written. Run install again.`);
  }
  const git = gitRunner(["--git-dir", plan.bare]);
  if (now && plan.hookAction === "replace") backup = backupFile("delivery", plan.hookPath, stamp);
  for (const c of plan.config) if (c.from !== c.to) git(["config", c.key, c.to]);
  if (plan.hookAction !== "unchanged") {
    mkdirSync(dirname(plan.hookPath), { recursive: true });
    const temp = join(dirname(plan.hookPath), `.pre-receive.skilliton-${process.pid}`);
    writeFileSync(temp, plan.hookText, { mode: 0o755 });
    chmodSync(temp, 0o755);
    renameSync(temp, plan.hookPath);
  }
  const written = statSync(plan.hookPath);
  if ((written.mode & 0o111) !== 0o111 || readFileSync(plan.hookPath, "utf8") !== plan.hookText) {
    throw new DeliveryError(`${plan.hookPath} was written but does not read back as the executable hook`);
  }
  return { backup };
}
