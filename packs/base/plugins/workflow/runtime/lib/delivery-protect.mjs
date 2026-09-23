// lib/delivery-protect.mjs: the gate protects the program that runs its checks (N83, docs/CONTRACTS.md section 14).
//
// A check is only as good as the file it runs. Before this rule, a push that rewrote scripts/checks.mjs to exit 0,
// beside a failing test, was accepted: the gate ran the pushed checks.mjs, which passed. Now the paths a policy runs
// are held the way its policy paths are. A pushed update that changes a protected path is accepted only when the commit
// that changes it is signed by an approver (the allowed-signers list the policy signature uses), and the gate decides
// this before it extracts or runs anything, so a rewritten check never executes.
//
// Which paths are protected:
//   - the policy's "protectedPaths", when it has one: a folder ends with "/" and covers everything below it, a file is
//     matched exactly. An explicit list replaces the default, and may be empty (a policy change, so it is signed);
//   - otherwise the default: every argument of a check command (the program included, and the value of a --name=value
//     argument) that is a repository-relative path naming a file in the pushed tree, plus .github/workflows/. An
//     argument that names no file there (a flag, a program on PATH, a script the tree does not hold) protects nothing,
//     and a check whose script is missing fails on its own when it cannot start.
//
// It also keeps the gate's two small tree readers (blobAt, changedPaths), moved here from lib/delivery.mjs when that
// file reached the ceiling scripts/lint.test.mjs holds it to, and the bounded line reader for a check's output (N84).
//
// Pure over the git runner the gate already holds; it never reads a working tree, because inside pre-receive there is
// none.

import { matchPolicyPath } from "./delivery-policy.mjs";

const DEFAULT_PROTECTED_FOLDERS = [".github/workflows/"];
const LINE_LIMIT = 400;
const short = (id) => String(id).slice(0, 12);

// ---------- the gate's tree readers ----------

// The blob id at commit:path, or null when the path is absent there.
export function blobAt(git, commit, path) {
  const r = git(["rev-parse", "--verify", "-q", `${commit}:${path}`], { allowExit: "any" });
  return r.status === 0 ? r.stdout.trim() : null;
}

// The paths a commit changes against its first parent (every path, for a root commit).
export function changedPaths(git, id, parent) {
  const args = parent
    ? ["diff-tree", "-r", "-z", "--no-commit-id", "--name-only", "--no-renames", parent, id]
    : ["diff-tree", "-r", "-z", "--root", "--no-commit-id", "--name-only", "--no-renames", id];
  return git(args).stdout.split("\0").filter(Boolean);
}

// ---------- which paths are protected ----------

// A repository-relative path an argument could name, or null. A leading "./" is dropped, since git names paths without
// it; an absolute path, a path that climbs out with "..", or anything with a control character names no tracked file.
function repositoryPath(arg) {
  if (typeof arg !== "string") return null;
  let p = arg;
  while (p.startsWith("./")) p = p.slice(2);
  if (!p || p.length > 400 || p.startsWith("/") || p.startsWith("-") || p.endsWith("/") || p.includes("\\") || /[\x00-\x1f\x7f]/.test(p)) return null;
  return p.split("/").every((part) => part.length > 0 && part !== "." && part !== "..") ? p : null;
}

// Each argument of each check, and the value of an argument written --name=value.
function checkArguments(policy) {
  const found = [];
  for (const check of policy.checks) {
    for (const arg of check.command) {
      found.push(arg);
      const eq = /^--?[A-Za-z0-9][A-Za-z0-9-]*=(.+)$/.exec(arg);
      if (eq) found.push(eq[1]);
    }
  }
  return found;
}

// The default list for a policy at a pushed tip: the check arguments that name a file there, and the workflow folder.
function defaultProtectedPaths(git, policy, commit) {
  const files = new Set();
  for (const arg of checkArguments(policy)) {
    const path = repositoryPath(arg);
    if (!path || files.has(path)) continue;
    const r = git(["cat-file", "-t", `${commit}:${path}`], { allowExit: "any" });
    if (r.status === 0 && r.stdout.trim() === "blob") files.add(path);
  }
  return [...files, ...DEFAULT_PROTECTED_FOLDERS];
}

// The entry that covers a path, or null. A folder entry covers everything below it; a file entry only itself.
function matchProtectedPath(path, entries) {
  for (const entry of entries) {
    if (entry.endsWith("/") ? path.startsWith(entry) : path === entry) return entry;
  }
  return null;
}

// ---------- the rule ----------

// commits: [{ id, parent }] from the current tip to the pushed tip, each judged against its first parent.
// signatureStatus(id): { state: "verified" | "unverified" | "not-checked", reason? }.
// guarded: the policy paths lib/delivery.mjs holds with its own rule and message; a path one of them covers is left
// to that rule, which runs next and asks for the same signature.
// Returns { reason } when the push is to be rejected, else { notChecked: [...], paths: [the protected list] }.
export function checkProtectedPaths({ git, oldId, newId, policy, commits, signatureStatus, guarded = [] }) {
  const explicit = Array.isArray(policy.protectedPaths);
  const paths = explicit ? policy.protectedPaths : defaultProtectedPaths(git, policy, newId);
  const notChecked = [];
  if (!paths.length) return { notChecked, paths };
  const held = (p) => matchProtectedPath(p, paths) && !matchPolicyPath(p, guarded);
  const because = explicit ? "the policy's protectedPaths lists it" : "a check runs it or it is a workflow file";
  const needed = "a change to it needs a commit signed by an approver (a key in the approvers file); push the change as its own signed commit";
  const approved = [];
  for (const { id, parent } of commits) {
    const touched = changedPaths(git, id, parent).filter(held);
    if (!touched.length) continue;
    const what = `commit ${short(id)} changes the protected path ${touched[0]}${touched.length > 1 ? ` (and ${touched.length - 1} more)` : ""}`;
    const sig = signatureStatus(id);
    if (sig.state === "unverified") return { reason: `${what}, which the delivery gate protects because ${because}; ${needed}. This commit: ${sig.reason}` };
    if (sig.state === "not-checked") notChecked.push(`${what} and needs an approver signature`);
    approved.push({ id, touched });
  }
  // As for policy paths in lib/delivery.mjs: each commit is compared with its first parent only, so a merge can bring
  // back an earlier version of a protected file without any commit changing it. The combined result must hold, for
  // every protected path that differs, exactly the content an approved commit in this push gave it.
  for (const path of changedPaths(git, newId, oldId).filter(held)) {
    const final = blobAt(git, newId, path);
    if (!approved.some((c) => c.touched.includes(path) && blobAt(git, c.id, path) === final)) {
      return { reason: `the pushed result changes the protected path ${path} (the delivery gate protects it because ${because}) to content that no approver-signed commit in this push gave it (for example a merge that brings back an earlier version); ${needed}` };
    }
  }
  return { notChecked, paths };
}

// ---------- a check's output, read a line at a time with a bounded carry (N84) ----------

// keep(line) receives every complete line. A stream that writes without a newline (a progress writer, or a check
// that prints megabytes on one line) must not grow the carry without bound: once the carry passes the limit it is
// kept as a line of its own and reset, as lib/gate.mjs does. flush() hands over whatever is left at the end.
export function lineReader(keep, limit = LINE_LIMIT) {
  let carry = "";
  return {
    feed(chunk) {
      const lines = (carry + chunk.toString("utf8")).replace(/\r(?=\n)/g, "").split("\n");
      carry = lines.pop();
      lines.forEach(keep);
      if (carry.length > limit) { keep(carry); carry = ""; }
    },
    flush() { if (carry) { keep(carry); carry = ""; } },
    carried: () => carry.length,
  };
}
