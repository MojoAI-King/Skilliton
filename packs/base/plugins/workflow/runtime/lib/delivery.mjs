// delivery.mjs: trusted delivery checks for shared branches. Contract: docs/CONTRACTS.md section 14; the plain-language
// guide is docs/DELIVERY.md. This is the engine behind `skilliton delivery install | gate | check`.
//
// A shared bare repository runs `delivery gate` from its pre-receive hook. For each update to a protected branch the
// gate, in this order:
//   1. rejects deleting the branch and non-fast-forward updates;
//   2. reads the delivery policy from the branch's current tip, never from the pushed commits (a push that creates a
//      protected branch is the one exception: its tip must carry a valid policy and an approver's SSH signature);
//   3. requires every pushed commit whose change against its first parent touches a policy path to verify with
//      `git -c gpg.ssh.allowedSignersFile=<approvers> verify-commit`;
//   4. refuses a pushed tip whose own policy is missing or invalid, because accepting it would reject every later push;
//   5. materializes the pushed tip with `git archive` into a temporary folder (never a checkout inside the bare
//      repository) and confirms every extracted file matches the commit, because .gitattributes export rules can
//      drop or rewrite files in an archive;
//   6. runs each check's argument list there, with its timeout and a minimal environment (PATH, a temporary HOME,
//      LANG), and rejects on the first failure with the check's name and the last lines of its output.
//
// Which branches are protected: the policy on the repository's default branch (the bare repository's HEAD) lists
// them. While the default branch does not exist or holds no policy, the default branch alone is protected. An invalid
// policy on the default branch rejects every push, because the protected branches cannot be determined.
//
// Node built-ins only; nothing here imports from outside the plugin folder. Programs run from argument lists, never
// through a shell. The gate fails closed: an error it cannot handle rejects the push and says why.

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { isDir, refuse } from "./core.mjs";
import { NO_REPOSITORY_PROGRAMS } from "./journal.mjs";
import { auditFiles, findingLine } from "./audit.mjs";
import { readWorking } from "./audit-run.mjs";
import { LEGACY_POLICY_FILE } from "./legacy-names.mjs";
import { checkRemovals } from "./delivery-persist.mjs";
import { gateChanges, gateFingerprint } from "./delivery-integrity.mjs";
import {
  CURRENT_FORMAT, LEGACY_FORMAT, POLICY_FILE, matchPolicyPath, parsePolicyText, readApproversFile, validBranchName,
} from "./delivery-policy.mjs";

const TAIL_LINES = 20;
const MAX_POLICY_BYTES = 256 * 1024;
const GIT_MAX_BUFFER = 512 * 1024 * 1024;

// An error the gate cannot turn into a policy decision (git failed, a file could not be written). The gate reports it
// as a rejection with its reason; the command line exits 3.
export class DeliveryError extends Error {}

const short = (id) => String(id).slice(0, 12);
const isZeroId = (id) => /^0+$/.test(id);
const zeroIdLike = (id) => "0".repeat(id.length);
function lastLines(text, n) {
  return String(text ?? "").replace(/\r/g, "").split("\n").map((l) => l.trimEnd()).filter(Boolean).slice(-n);
}

// ---------- git ----------

// A git runner bound to one repository: where is ["--git-dir", <bare repository>] or ["-C", <working tree>]. The
// environment passes through, so inside a pre-receive hook git still sees the quarantined pushed objects, with
// GIT_NO_REPLACE_OBJECTS added: a refs/replace/ entry would otherwise put a forged commit's policy in place of the real
// tip's, and every read the gate makes (policy, tree, archive, signature) must be of the object stored (as trust.mjs).
export function gitRunner(where, passed = process.env) {
  const env = { ...passed, GIT_NO_REPLACE_OBJECTS: "1" };
  const git = (args, { allowExit = [0], buffer = false } = {}) => {
    const r = spawnSync("git", [...where, ...NO_REPOSITORY_PROGRAMS, ...args], {
      env, encoding: buffer ? "buffer" : "utf8", maxBuffer: GIT_MAX_BUFFER, stdio: ["ignore", "pipe", "pipe"],
    });
    if (r.error) throw new DeliveryError(r.error.code === "ENOENT" ? "git was not found on PATH" : `git could not run (${r.error.message})`);
    if (allowExit !== "any" && !allowExit.includes(r.status)) {
      const detail = lastLines(buffer ? r.stderr?.toString("utf8") : r.stderr, 2).join(" / ");
      const shown = args.filter((a) => a !== "-c" && !a.includes("=")).slice(0, 2).join(" ");
      throw new DeliveryError(`git ${shown} failed (${r.status === null ? `signal ${r.signal}` : `exit ${r.status}`})${detail ? `: ${detail}` : ""}`);
    }
    return { status: r.status, stdout: r.stdout ?? (buffer ? Buffer.alloc(0) : ""), stderr: buffer ? String(r.stderr ?? "") : r.stderr ?? "" };
  };
  git.where = where;
  git.env = env;
  return git;
}

function revParseCommit(git, name) {
  const r = git(["rev-parse", "--verify", "-q", `${name}^{commit}`], { allowExit: [0, 1] });
  return r.status === 0 ? r.stdout.trim() : null;
}

// The policy at a commit: { state: "absent" } | { state: "invalid", problems, file } | { state: "valid", policy, file }.
// A commit without .skilliton/delivery.json that still has the earlier policy file (legacy-names.mjs) is governed by that
// policy, read in its earlier format, so a shared branch stays protected until its migration commit moves the file.
function readPolicyAt(git, commit) {
  for (const format of [CURRENT_FORMAT, LEGACY_FORMAT]) {
    const listing = git(["ls-tree", "-z", "--full-tree", commit, "--", format.file]).stdout;
    const entry = listing.split("\0").find(Boolean);
    if (!entry) continue;
    const m = /^(\d{6}) (\w+) ([0-9a-f]{40,64})\t([\s\S]*)$/.exec(entry);
    if (!m) throw new DeliveryError(`unexpected git ls-tree output for ${format.file} at ${short(commit)}`);
    if (m[2] !== "blob" || (m[1] !== "100644" && m[1] !== "100755")) {
      return { state: "invalid", file: format.file, problems: [`${format.file} must be a regular file (found a ${m[2]} with mode ${m[1]})`] };
    }
    const size = Number(git(["cat-file", "-s", m[3]]).stdout.trim());
    if (!(size <= MAX_POLICY_BYTES)) return { state: "invalid", file: format.file, problems: [`${format.file} is ${size} bytes; the limit is ${MAX_POLICY_BYTES}`] };
    const parsed = parsePolicyText(git(["cat-file", "blob", m[3]]).stdout, format);
    return parsed.policy ? { state: "valid", policy: parsed.policy, file: format.file } : { state: "invalid", file: format.file, problems: parsed.problems };
  }
  return { state: "absent" };
}

// Where branch tips and the default branch come from. The gate reads the bare repository's own refs; `delivery check`
// reads a working repository's remote-tracking refs for one remote.
export function bareView(git) {
  return {
    defaultBranch() {
      const r = git(["symbolic-ref", "-q", "HEAD"], { allowExit: [0, 1] });
      const ref = r.stdout.trim();
      return r.status === 0 && ref.startsWith("refs/heads/") && validBranchName(ref.slice(11)) ? ref.slice(11) : null;
    },
    tip: (branch) => revParseCommit(git, `refs/heads/${branch}`),
  };
}

function remoteView(git, remote) {
  const prefix = `refs/remotes/${remote}/`;
  return {
    defaultBranch() {
      const r = git(["symbolic-ref", "-q", `${prefix}HEAD`], { allowExit: [0, 1] });
      const ref = r.stdout.trim();
      return r.status === 0 && ref.startsWith(prefix) && validBranchName(ref.slice(prefix.length)) ? ref.slice(prefix.length) : null;
    },
    tip: (branch) => revParseCommit(git, `${prefix}${branch}`),
  };
}

// Which branch names are protected: { names: Set, defaultBranch, basis } or { error }.
export function protectionFor(git, view) {
  const def = view.defaultBranch();
  if (!def) return { error: "the repository's HEAD does not name a default branch, so the protected branches cannot be determined" };
  const tip = view.tip(def);
  if (!tip) return { names: new Set([def]), defaultBranch: def, basis: `the default branch ${def} does not exist yet, so it is protected` };
  const found = readPolicyAt(git, tip);
  if (found.state === "absent") return { names: new Set([def]), defaultBranch: def, basis: `the default branch ${def} has no delivery policy, so it alone is protected` };
  if (found.state === "invalid") {
    return { error: `the delivery policy on the default branch ${def} is invalid (${found.problems.join("; ")}), so the protected branches cannot be determined` };
  }
  return { names: new Set(found.policy.protectedBranches), defaultBranch: def, basis: `the delivery policy on the default branch ${def}`, policy: found.policy };
}

// ---------- signatures ----------

// Every signature header of a raw commit object (gpgsig and gpgsig-sha256, in order); [] when it has none.
function commitSignatures(raw) {
  const end = raw.indexOf("\n\n");
  const lines = (end < 0 ? raw : raw.slice(0, end)).split("\n");
  const found = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^(gpgsig|gpgsig-sha256) (.*)$/.exec(lines[i]);
    if (!m) continue;
    const parts = [m[2]];
    while (i + 1 < lines.length && lines[i + 1].startsWith(" ")) parts.push(lines[++i].slice(1));
    found.push(parts.join("\n"));
  }
  return found;
}

// git picks the verifier from the shape of the header it reads (gpgsig in a SHA-1 repository, gpgsig-sha256 in a
// SHA-256 one), and gpg.program and gpg.x509.program come from the server's configuration, so both point at a program
// that does not exist, as lib/trust.mjs does for release tags. The approvers file and ssh-keygen decide, or nothing does.
const SSH_KEYGEN_ONLY = ["-c", "gpg.ssh.program=ssh-keygen", "-c", "gpg.program=skilliton-refuses-any-verifier-but-ssh-keygen", "-c", "gpg.x509.program=skilliton-refuses-any-verifier-but-ssh-keygen"];

// { state: "verified", detail } | { state: "unverified", reason } | { state: "not-checked" } (no approvers file).
function signatureStatus(ctx, commit) {
  if (!ctx.approvers) return { state: "not-checked" };
  const signatures = commitSignatures(ctx.git(["cat-file", "commit", commit]).stdout);
  if (!signatures.length) return { state: "unverified", reason: "the commit is not signed" };
  // Only SSH signatures are accepted, in every header: an OpenPGP or X.509 one would be judged by whatever keyring the
  // server happens to have, not by the approvers file, and the header git reads need not be the first.
  if (signatures.some((s) => !s.startsWith("-----BEGIN SSH SIGNATURE-----"))) {
    return { state: "unverified", reason: "the commit carries a non-SSH signature, which the approvers file cannot verify" };
  }
  const r = ctx.git(["-c", `gpg.ssh.allowedSignersFile=${ctx.approvers}`, ...SSH_KEYGEN_ONLY, "verify-commit", commit], { allowExit: "any" });
  if (r.status === 0) return { state: "verified", detail: lastLines(r.stderr, 1)[0] ?? "good signature" };
  return { state: "unverified", reason: `its signature is not from a key in the approvers file (${lastLines(r.stderr, 1)[0] ?? `verify-commit exit ${r.status}`})` };
}

// ---------- commits and paths ----------

function commitsBetween(git, oldId, newId) {
  return git(["rev-list", "--reverse", "--topo-order", "--parents", `${oldId}..${newId}`]).stdout
    .split("\n").filter(Boolean).map((line) => { const [id, parent = null] = line.split(" "); return { id, parent }; });
}

// The blob id at commit:path, or null when the path is absent there.
function blobAt(git, commit, path) {
  const r = git(["rev-parse", "--verify", "-q", `${commit}:${path}`], { allowExit: "any" });
  return r.status === 0 ? r.stdout.trim() : null;
}

function changedPaths(git, id, parent) {
  const args = parent
    ? ["diff-tree", "-r", "-z", "--no-commit-id", "--name-only", "--no-renames", parent, id]
    : ["diff-tree", "-r", "-z", "--root", "--no-commit-id", "--name-only", "--no-renames", id];
  return git(args).stdout.split("\0").filter(Boolean);
}

// ---------- materializing a commit ----------

function waitFor(child, program) {
  return new Promise((done) => {
    let settled = false;
    child.on("error", (e) => { if (!settled) { settled = true; done({ error: e.code === "ENOENT" ? `${program} was not found on PATH` : e.message }); } });
    child.on("close", (code, signal) => { if (!settled) { settled = true; done({ code, signal }); } });
  });
}

// git archive <commit> | tar -x, with both programs started from argument lists.
async function extractArchive(git, commit, dir) {
  const archive = spawn("git", [...git.where, ...NO_REPOSITORY_PROGRAMS, "-c", "core.autocrlf=false", "archive", "--format=tar", commit], { env: git.env, stdio: ["ignore", "pipe", "pipe"] });
  const tar = spawn("tar", ["-x", "-f", "-", "-C", dir], { env: git.env, stdio: ["pipe", "ignore", "pipe"] });
  let archiveErr = "", tarErr = "";
  archive.stderr.on("data", (c) => { if (archiveErr.length < 8192) archiveErr += c; });
  tar.stderr.on("data", (c) => { if (tarErr.length < 8192) tarErr += c; });
  archive.stdout.on("error", () => {});
  tar.stdin.on("error", () => {});
  // If tar stops reading, close the pipe so git archive cannot block forever on a full buffer.
  const stopArchive = () => { archive.stdout.destroy(); if (archive.exitCode === null) archive.kill("SIGKILL"); };
  tar.on("error", stopArchive);
  tar.on("close", () => archive.stdout.destroy());
  archive.stdout.pipe(tar.stdin);
  const [a, t] = await Promise.all([waitFor(archive, "git"), waitFor(tar, "tar")]);
  const why = (r) => r.error ?? (r.code === null ? `signal ${r.signal}` : `exit ${r.code}`);
  if (a.error || a.code !== 0) throw new DeliveryError(`git archive of ${short(commit)} failed (${why(a)})${archiveErr.trim() ? `: ${lastLines(archiveErr, 2).join(" / ")}` : ""}`);
  if (t.error || t.code !== 0) throw new DeliveryError(`extracting the archive of ${short(commit)} failed (${why(t)})${tarErr.trim() ? `: ${lastLines(tarErr, 2).join(" / ")}` : ""}`);
}

function blobId(bytes, hexLength) {
  return createHash(hexLength === 64 ? "sha256" : "sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

// Every way the extracted folder differs from the commit's tree. Paths are compared as raw bytes.
function treeDifferences(git, commit, dir) {
  const listing = git(["ls-tree", "-r", "-z", "--full-tree", commit], { buffer: true }).stdout;
  const expected = new Map();
  let start = 0;
  for (let i = 0; i < listing.length; i++) {
    if (listing[i] !== 0) continue;
    const entry = listing.subarray(start, i);
    start = i + 1;
    const tab = entry.indexOf(9);
    const m = tab > 0 ? /^(\d{6}) (blob|tree|commit) ([0-9a-f]{40}|[0-9a-f]{64})$/.exec(entry.subarray(0, tab).toString("latin1")) : null;
    if (!m) throw new DeliveryError(`unexpected git ls-tree output for ${short(commit)}`);
    expected.set(entry.subarray(tab + 1).toString("latin1"), { mode: m[1], type: m[2], oid: m[3] });
  }
  const root = Buffer.from(dir + sep);
  const onDisk = (key) => Buffer.concat([root, Buffer.from(key, "latin1")]);
  const shown = (key) => Buffer.from(key, "latin1").toString("utf8");
  const differences = [];
  for (const [key, e] of expected) {
    if (e.type !== "blob") continue; // a submodule's content is not part of the commit
    let st;
    try { st = lstatSync(onDisk(key)); } catch { differences.push(`${shown(key)} is missing`); continue; }
    let bytes;
    if (e.mode === "120000") {
      if (!st.isSymbolicLink()) { differences.push(`${shown(key)} is not a symbolic link`); continue; }
      bytes = readlinkSync(onDisk(key), { encoding: "buffer" });
    } else {
      if (!st.isFile()) { differences.push(`${shown(key)} is not a regular file`); continue; }
      bytes = readFileSync(onDisk(key));
    }
    if (blobId(bytes, e.oid.length) !== e.oid) differences.push(`${shown(key)} differs from the committed content`);
  }
  const pending = [Buffer.alloc(0)];
  while (pending.length) {
    const rel = pending.pop();
    const abs = rel.length ? Buffer.concat([root, rel]) : Buffer.from(dir);
    for (const d of readdirSync(abs, { withFileTypes: true, encoding: "buffer" })) {
      const childRel = rel.length ? Buffer.concat([rel, Buffer.from("/"), d.name]) : d.name;
      if (d.isDirectory()) pending.push(childRel);
      else if (!expected.has(childRel.toString("latin1"))) differences.push(`${childRel.toString("utf8")} is not in the commit`);
    }
  }
  return differences;
}

// ---------- running one check ----------

// Runs a check's argument list with cwd in the materialized tree. Resolves { ok, how, seconds, tail }.
function runCheck(check, { cwd, home }) {
  return new Promise((done) => {
    const began = Date.now();
    const tail = [];
    const keep = (line) => {
      tail.push(line.length > 400 ? `${line.slice(0, 400)} ...` : line);
      if (tail.length > TAIL_LINES) tail.shift();
    };
    const env = { PATH: process.env.PATH || "/usr/bin:/bin", HOME: home, LANG: process.env.LANG || "C" };
    const group = process.platform !== "win32";
    let child;
    try {
      child = spawn(check.command[0], check.command.slice(1), { cwd, env, stdio: ["ignore", "pipe", "pipe"], detached: group });
    } catch (e) {
      done({ ok: false, how: `could not start: ${e.message}`, seconds: 0, tail });
      return;
    }
    const partial = { out: "", err: "" };
    const feed = (key) => (chunk) => {
      const lines = (partial[key] + chunk.toString("utf8")).replace(/\r(?=\n)/g, "").split("\n");
      partial[key] = lines.pop();
      lines.forEach(keep);
    };
    child.stdout.on("data", feed("out"));
    child.stderr.on("data", feed("err"));
    let timedOut = false, settled = false, exit = null, grace = null;
    // Kill the whole process group: a test runner's own children must not outlive the check or hold its pipes open.
    const killAll = () => {
      try { if (child.pid) process.kill(group ? -child.pid : child.pid, "SIGKILL"); } catch { /* already gone */ }
    };
    const timer = setTimeout(() => { timedOut = true; killAll(); }, check.timeoutSeconds * 1000);
    const finish = (how) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(grace);
      child.stdout?.destroy();
      child.stderr?.destroy();
      for (const key of ["out", "err"]) if (partial[key]) { keep(partial[key]); partial[key] = ""; }
      const seconds = Math.round((Date.now() - began) / 100) / 10;
      const ok = !timedOut && how === null && exit?.code === 0;
      const reason = timedOut ? `timed out after ${check.timeoutSeconds}s`
        : how ?? (exit.code === null ? `killed by ${exit.signal}` : `exit ${exit.code}`);
      done({ ok, how: reason, seconds, tail });
    };
    const program = check.command[0];
    child.on("error", (e) => finish(e.code === "ENOENT" ? `could not start: ${program} was not found${program.includes("/") ? "" : " on PATH"}` : `could not start: ${e.message}`));
    child.on("exit", (code, signal) => {
      exit = { code, signal };
      killAll();
      grace = setTimeout(() => { child.stdout.destroy(); child.stderr.destroy(); finish(null); }, 5000);
    });
    child.on("close", (code, signal) => {
      if (!exit) exit = { code, signal };
      finish(null);
    });
  });
}

// ---------- evaluating one update to a protected branch ----------

const checkSummary = (names) => (names.length ? `${names.length} check(s) passed (${names.join(", ")})` : "the policy lists no checks");

// update: { ref, branch, oldId, newId }. ctx: { git, approvers (path or null), say (progress line) }.
// Resolves { verdict: "accepted", checks, notChecked } or { verdict: "rejected", reason, tail?, notChecked }.
async function evaluateUpdate(ctx, update) {
  const { git, say } = ctx;
  const { branch, oldId, newId } = update;
  const notChecked = [];
  const reject = (reason, tail) => ({ verdict: "rejected", reason, tail, notChecked });

  if (isZeroId(newId)) return reject("deleting a protected branch is not allowed");
  let policy, source;
  if (isZeroId(oldId)) {
    // Creating a protected branch: there is no current tip to read a policy from, so the pushed tip must carry a
    // valid policy and an approver's signature.
    const pushed = readPolicyAt(git, newId);
    if (pushed.state === "absent") return reject(`creating the protected branch ${branch} needs a delivery policy (${POLICY_FILE}) in the pushed commit ${short(newId)}`);
    if (pushed.state === "invalid") return reject(`creating the protected branch ${branch}: the delivery policy in the pushed commit ${short(newId)} is invalid: ${pushed.problems.join("; ")}`);
    const sig = signatureStatus(ctx, newId);
    if (sig.state === "unverified") return reject(`creating the protected branch ${branch} needs its tip commit ${short(newId)} signed by an approver: ${sig.reason}`);
    if (sig.state === "not-checked") notChecked.push(`commit ${short(newId)} creates the protected branch and needs an approver signature`);
    policy = pushed.policy;
    source = `the policy in the pushed commit ${short(newId)}${sig.state === "verified" ? ", signed by an approver" : ""}`;
  } else {
    const ff = git(["merge-base", "--is-ancestor", oldId, newId], { allowExit: [0, 1] });
    if (ff.status !== 0) return reject(`non-fast-forward update: the pushed commit ${short(newId)} does not contain the current tip ${short(oldId)}; fetch and merge (or rebase), then push again`);
    const current = readPolicyAt(git, oldId);
    if (current.state === "absent") return reject("no delivery policy on the protected branch");
    if (current.state === "invalid") return reject(`the delivery policy on the protected branch (${current.file} at ${short(oldId)}) is invalid: ${current.problems.join("; ")}`);
    policy = current.policy;
    source = `the policy at the current tip ${short(oldId)}${current.file === LEGACY_POLICY_FILE ? ` (${LEGACY_POLICY_FILE}, from before the rename to Skilliton)` : ""}`;
    // Both policy files are always guarded, whichever one governs the branch, so a commit cannot add a weaker policy
    // under the other name without an approver's signature.
    const guarded = [...policy.policyPaths, POLICY_FILE, LEGACY_POLICY_FILE];
    const approved = [];
    const pushed = commitsBetween(git, oldId, newId);
    for (const { id, parent } of pushed) {
      const touched = changedPaths(git, id, parent).filter((path) => matchPolicyPath(path, guarded));
      if (!touched.length) continue;
      const what = `commit ${short(id)} changes the policy path ${touched[0]}${touched.length > 1 ? ` (and ${touched.length - 1} more)` : ""}`;
      const sig = signatureStatus(ctx, id);
      if (sig.state === "unverified") return reject(`${what} without an approver signature: ${sig.reason}`);
      if (sig.state === "not-checked") notChecked.push(`${what} and needs an approver signature`);
      approved.push({ id, touched });
    }
    // Each commit above is compared with its first parent only, so a merge can bring back an earlier version of a
    // guarded file (or drop the current policy, letting an earlier one govern) without any commit changing it. The
    // combined result closes that: every guarded path that differs between the current tip and the pushed tip must
    // hold exactly the content an approved commit in this push gave it.
    for (const path of changedPaths(git, newId, oldId).filter((p) => matchPolicyPath(p, guarded))) {
      const final = blobAt(git, newId, path);
      if (!approved.some((c) => c.touched.includes(path) && blobAt(git, c.id, path) === final)) {
        return reject(`the pushed result changes the policy path ${path} to content that no approver-signed commit in this push gave it (for example a merge that brings back an earlier version); push the policy change as its own signed commit`);
      }
    }
    // What Skilliton keeps in the project may not be removed without an approver's signature (lib/delivery-persist.mjs).
    const removal = checkRemovals({ git, oldId, newId, commits: pushed, signatureStatus: (id) => signatureStatus(ctx, id) });
    if (removal.reason) return reject(removal.reason);
    notChecked.push(...removal.notChecked);
    const next = readPolicyAt(git, newId);
    if (next.state === "absent") return reject(`the pushed commit ${short(newId)} removes ${POLICY_FILE}; accepting it would reject every later push to this branch`);
    if (next.state === "invalid") return reject(`the delivery policy in the pushed commit ${short(newId)} is invalid (${next.problems.join("; ")}); accepting it would reject every later push to this branch`);
  }

  // The audit reads the files this push changed, at the pushed tip (docs/CONTRACTS.md section 14). It reads them out
  // of the archive the gate already extracted and matched against the commit, so it sees exactly the bytes the checks
  // run on, and it reads the whole of each changed file rather than the added lines alone: a file you touched is a
  // file you are answering for. A line that is meant to be there carries a "skilliton-audit: allow <rule> <why>"
  // marker, and a project that wants none of this sets "audit": {"enabled": false} in the policy, which is a policy
  // change and so needs an approver's signature.
  //
  // It is not read through the runtime's usual git helper, and must not be: that helper clears GIT_OBJECT_DIRECTORY
  // and GIT_ALTERNATE_OBJECT_DIRECTORIES, which is where git keeps the objects of a push it has not yet accepted, so
  // inside pre-receive the pushed commit would not be found at all.
  //
  // Creating a protected branch is the one update it skips, and says so: there is no previous tip to compare with,
  // auditing the whole tree would reject the push that installs the gate over code that was already there, and that
  // push already needs an approver's signature on its tip.
  const auditing = policy.audit.enabled && !isZeroId(oldId);
  if (policy.audit.enabled && isZeroId(oldId)) say(`audit: not run for the push that creates ${branch}, which has no previous tip to compare with`);
  if (!policy.checks.length && !auditing) {
    say(`checking ${update.ref} at ${short(newId)} with ${source}: it lists no checks${policy.audit.enabled ? "" : " and the audit is off"}, so nothing was run`);
    return { verdict: "accepted", checks: [], notChecked };
  }
  const work = mkdtempSync(join(tmpdir(), "skilliton-delivery-"));
  try {
    const tree = join(work, "tree");
    const home = join(work, "home");
    mkdirSync(tree);
    mkdirSync(home);
    const doing = [policy.checks.length ? `${policy.checks.length} check(s)` : null, auditing ? "the audit" : null].filter(Boolean).join(" and ");
    say(`checking ${update.ref} at ${short(newId)} with ${source}: ${doing}`);
    await extractArchive(git, newId, tree);
    const differences = treeDifferences(git, newId, tree);
    if (differences.length) {
      const shown = differences.slice(0, 3).join("; ");
      return reject(`the archive of ${short(newId)} does not match the commit (${shown}${differences.length > 3 ? `; ${differences.length} differences in all` : ""}). A .gitattributes export rule or a content filter changed it, and checks run only on exactly the committed files`);
    }
    if (auditing) {
      // A deletion is left out: there is nothing to read, and the file is gone from the result this push produces.
      const paths = git(["diff", "--name-only", "-z", "--diff-filter=d", oldId, newId, "--"]).stdout.split("\0").filter(Boolean);
      const { files, skipped } = readWorking(tree, paths, "it is not in the pushed commit");
      const result = auditFiles(files);
      for (const s of [...result.skipped, ...skipped]) say(`audit: not read ${s.path}: ${s.why}`);
      for (const a of result.allowed) say(`audit: allowed ${a.path}:${a.line} ${a.rule}: ${a.allowedBecause}`);
      if (result.findings.length) {
        return reject(
          `the audit found ${result.findings.length} finding(s) in the ${files.length} file(s) this push changed. Fix each one, mark the line with "skilliton-audit: allow <rule> <why it is allowed here>", or turn the audit off with "audit": {"enabled": false} in the policy, which needs an approver signature like any policy change`,
          result.findings.slice(0, TAIL_LINES).map(findingLine),
        );
      }
      say(`audit: nothing found in the ${files.length} file(s) this push changed`);
      if (!policy.checks.length) return { verdict: "accepted", checks: [], notChecked };
    }
    const passed = [];
    for (const check of policy.checks) {
      const outcome = await runCheck(check, { cwd: tree, home });
      if (!outcome.ok) return reject(`check "${check.name}" failed (${outcome.how})`, outcome.tail);
      say(`check "${check.name}" passed in ${outcome.seconds}s`);
      passed.push(check.name);
    }
    return { verdict: "accepted", checks: passed, notChecked };
  } finally {
    try { rmSync(work, { recursive: true, force: true }); } catch (e) { say(`note: the temporary folder ${work} could not be removed (${e.code ?? e.message})`); }
  }
}

// ---------- the gate (pre-receive) ----------

// "<old> <new> <ref>" lines, as git feeds a pre-receive hook.
function parseRefUpdates(text) {
  const updates = [];
  const problems = [];
  const lines = String(text).split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  lines.forEach((line, i) => {
    const m = /^([0-9a-f]{40}|[0-9a-f]{64}) ([0-9a-f]{40}|[0-9a-f]{64}) (refs\/[^\s]+)$/.exec(line);
    if (!m || m[1].length !== m[2].length) problems.push(`input line ${i + 1} is not "<old> <new> <ref>": ${JSON.stringify(line.slice(0, 120))}`);
    else updates.push({ oldId: m[1], newId: m[2], ref: m[3] });
  });
  return { updates, problems };
}

function approversSetting(git) {
  const r = git(["config", "--get", "skilliton.approvers"], { allowExit: [0, 1] });
  const path = r.status === 0 ? r.stdout.replace(/\n$/, "") : "";
  if (!path) return { problem: "skilliton.approvers is not set in this repository's git config; run skilliton delivery install" };
  const found = readApproversFile(path);
  if (found.problems) return { problem: `the approvers file ${path} ${found.problems.join("; ")}` };
  return { path };
}

// Evaluates a whole push. Returns 0 (accept), 1 (reject) or 3 (the gate could not finish, so it rejects).
export async function runGate({ bare, input, print = (line) => console.log(line) }) {
  const say = (text) => print(`skilliton delivery: ${text}`);
  let current = "this push";
  try {
    const { updates, problems } = parseRefUpdates(input);
    if (problems.length) { say(`rejected ${current}: ${problems[0]}`); return 1; }
    if (!updates.length) { say(`rejected ${current}: no ref updates arrived on standard input, so nothing could be checked`); return 1; }
    // A replacement makes plain git show another object in place of a real one, so no push may create, move or delete
    // one (the gate reads through none of them, above; everything else that reads this repository still would).
    const replacing = updates.find((u) => /^refs\/replace\//i.test(u.ref));
    if (replacing) { say(`rejected ${replacing.ref}: a push may not update refs/replace/, because a replacement shows another commit's content (such as a policy that protects nothing) in place of the real one; an administrator manages replacements on the server${updates.length > 1 ? ". The whole push was rejected; no ref in it was updated" : ""}`); return 1; }
    const git = gitRunner(["--git-dir", bare]);
    const approvers = approversSetting(git);
    if (approvers.problem) { say(`rejected ${updates[0].ref}: ${approvers.problem}`); return 1; }
    const protection = protectionFor(git, bareView(git));
    if (protection.error) { say(`rejected ${updates[0].ref}: ${protection.error}`); return 1; }
    const gate = gateFingerprint(git, bare); // before any check runs pushed code as this account (delivery-integrity.mjs)
    const accepted = [];
    for (const update of updates) {
      current = update.ref;
      const branch = update.ref.startsWith("refs/heads/") ? update.ref.slice("refs/heads/".length) : null;
      if (branch === null || !protection.names.has(branch)) {
        accepted.push(`accepted ${update.ref} without checks: not a protected branch`);
        continue;
      }
      let result = await evaluateUpdate({ git, dir: bare, approvers: approvers.path, say }, { ...update, branch });
      const changed = gateChanges(gate, gateFingerprint(git, bare));
      if (changed.length) result = { reason: `the checks changed the gate itself: ${changed.join("; ")}. A check runs the pushed code as the gate's own account, and the change is still in place: restore it (skilliton delivery install rewrites the hook) and inspect this repository before trusting its next push`, tail: result.tail };
      if (result.verdict !== "accepted") {
        say(`rejected ${update.ref}: ${result.reason}`);
        for (const line of result.tail ?? []) print(`  | ${line}`);
        if (updates.length > 1) say("the whole push was rejected; no ref in it was updated");
        return 1;
      }
      accepted.push(`accepted ${update.ref}: ${checkSummary(result.checks)}`);
    }
    accepted.forEach(say);
    return 0;
  } catch (e) {
    say(`rejected ${current}: the gate could not finish (${e?.message ?? e}), so the push was not accepted`);
    return 3;
  }
}

// ---------- delivery check (by hand, before pushing) ----------

export async function runLocalCheck({ repo, ref, remote = "origin", approvers, print = (line) => console.log(line) }) {
  const say = (text) => print(`skilliton delivery check: ${text}`);
  const dir = resolve(repo ?? process.cwd());
  if (!isDir(dir)) refuse(`--repo ${dir} is not an existing folder`);
  const top = gitRunner(["-C", dir])(["rev-parse", "--show-toplevel"], { allowExit: "any" });
  if (top.status !== 0 || !top.stdout.trim()) refuse(`${dir} is not inside a git working tree`);
  const git = gitRunner(["-C", top.stdout.trim()]);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(remote)) refuse(`--remote "${remote}" is not a remote name`);
  if (git(["config", "--get", `remote.${remote}.url`], { allowExit: [0, 1] }).status !== 0) refuse(`the repository has no remote named "${remote}" (pass --remote <name>)`);
  let branch = ref;
  if (!branch) {
    const r = git(["symbolic-ref", "-q", "--short", "HEAD"], { allowExit: [0, 1] });
    if (r.status !== 0) refuse("HEAD is not on a branch; pass --ref <branch> to name the shared branch to check against");
    branch = r.stdout.trim();
  }
  if (!validBranchName(branch)) refuse(`"${branch}" is not a plain branch name`);
  const head = revParseCommit(git, "HEAD");
  if (!head) refuse("the repository has no commit to check");
  let approversPath = null;
  if (approvers) {
    approversPath = resolve(approvers);
    const found = readApproversFile(approversPath);
    if (found.problems) refuse(`the approvers file ${approversPath} ${found.problems.join("; ")}`);
  }

  const old = revParseCommit(git, `refs/remotes/${remote}/${branch}`);
  say(`HEAD ${short(head)} as a push to ${branch} on ${remote}, compared with ${remote}/${branch} ${old ? short(old) : "(absent, so the push would create the branch)"} as last fetched; run git fetch ${remote} first for a current answer`);
  const dirty = git(["status", "--porcelain"]).stdout.split("\n").filter(Boolean).length;
  if (dirty) say(`note: ${dirty} uncommitted or untracked change(s) are not part of this check; only commit ${short(head)} is tested`);
  if (old === head) { say(`nothing to check: HEAD is already ${remote}/${branch}, so a push would change nothing`); return 0; }

  const view = remoteView(git, remote);
  let protection;
  if (view.defaultBranch() === null) {
    say(`note: ${remote}'s default branch is not recorded in this clone (git remote set-head ${remote} --auto records it), so ${branch} is evaluated as a protected branch`);
    protection = { names: new Set([branch]) };
  } else {
    protection = protectionFor(git, view);
  }
  if (protection.error) { say(`would be rejected: ${protection.error}`); return 1; }
  if (!protection.names.has(branch)) { say(`${branch} is not a protected branch (${protection.basis}); a push to it would be accepted without checks`); return 0; }

  const result = await evaluateUpdate({ git, dir: repo, approvers: approversPath, say }, { ref: `refs/heads/${branch}`, branch, oldId: old ?? zeroIdLike(head), newId: head });
  if (result.verdict !== "accepted") {
    say(`would be rejected: ${result.reason}`);
    for (const line of result.tail ?? []) print(`  | ${line}`);
    return 1;
  }
  if (result.notChecked.length) {
    say(`${checkSummary(result.checks)}, but approver signatures were NOT CHECKED here because no --approvers file was given: ${result.notChecked.join("; ")}. The shared repository verifies them when you push.`);
    return 1;
  }
  say(`would be accepted: ${checkSummary(result.checks)}`);
  return 0;
}
