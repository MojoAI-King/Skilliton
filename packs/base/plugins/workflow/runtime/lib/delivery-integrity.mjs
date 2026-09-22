// delivery-integrity.mjs: what the delivery gate is made of, fingerprinted before a push's checks run and after.
//
// A check runs the pushed code as the account the gate runs under (runCheck in lib/delivery.mjs). Where that account
// can write the shared repository, a check can rewrite the gate: its pre-receive hook, the approvers file, or the
// skilliton.* settings the hook and the gate read (and core.hooksPath, which moves the hook). runGate takes this
// fingerprint before any check runs and again after each update, and rejects the push naming what changed.
//
// What it does not do, so nobody reads more into it: it does not undo the change (the rewritten hook runs on the next
// push until someone reinstalls it), it cannot see a change a check makes and puts back before it ends, and it does
// not cover the runtime's own files or anything else the account can write. The remedy for all of that is the one
// docs/DELIVERY.md names: run the gate under an account that cannot write its own hook.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function digest(path) {
  try { return `sha256 ${createHash("sha256").update(readFileSync(path)).digest("hex")}`; } catch (e) { return `unreadable (${e.code ?? e.message})`; }
}

// { <what, in words>: <value> }. git is a lib/delivery.mjs runner bound to the bare repository at bare.
export function gateFingerprint(git, bare) {
  const settings = {};
  const listed = git(["config", "-z", "--get-regexp", "^(skilliton\\.|core\\.hookspath$)"], { allowExit: [0, 1] }).stdout;
  for (const entry of listed.split("\0").filter(Boolean)) {
    const cut = entry.indexOf("\n");
    const key = cut < 0 ? entry : entry.slice(0, cut);
    settings[key] = [...(settings[key] ?? []), cut < 0 ? "(no value)" : entry.slice(cut + 1)];
  }
  const hook = resolve(bare, git(["rev-parse", "--git-path", "hooks/pre-receive"]).stdout.trim());
  const found = { [`the pre-receive hook ${hook}`]: digest(hook) };
  for (const path of settings["skilliton.approvers"] ?? []) found[`the approvers file ${path}`] = digest(path);
  for (const [key, values] of Object.entries(settings)) found[`the git setting ${key}`] = JSON.stringify(values);
  return found;
}

// The names of every entry that differs, appeared or went away between two fingerprints.
export function gateChanges(before, after) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((what) => before[what] !== after[what]);
}
