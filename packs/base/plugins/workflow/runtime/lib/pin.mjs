// pin.mjs: pinning a clone of the company skills repository to a signed release tag, and moving it between
// releases (docs/CONTRACTS.md section 13, batch docs/areas/08-make-it-yours/batch-03-pinned-installs.md).
//
// What a pin is, and what it is not. This module pins the clone the launcher points at: the runtime that `skilliton`
// runs, the catalog and the manifest that verify checks an installed plugin against. The client's own download is
// moved by lib/marketplace-pin.mjs, which adds the marketplace at <source>#<release tag> (measured on Claude Code
// 2.1.278; the 2026-09-21 note that the client takes no ref was wrong for that version). A tag is a name, not a
// commit, so verify stays the check of what was installed.
//
// The pin follows the signature, not the ref. Checking out the tag name would follow wherever that ref points now;
// this checks out the commit the verified tag object names, which is the commit whose manifest hash the signer put
// their key behind.
//
// The record lives at <git dir>/skilliton-pin.json, inside the clone. A pin is a property of one clone, not of the
// machine, so it belongs with the clone and goes away when the clone does; nothing in ~/.config has to be undone.
// It carries every release tag object the clone held when it was pinned, which is what lets a later run see that one
// of them has moved.
//
// Node built-ins only; shells out to git only (through trust.mjs), with argument arrays, and never to a remote.

import { lstatSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isPlainObject, refuse, selfCommand, tilde } from "./core.mjs";
import { RELEASE_TAG, VERSION_RE, openRepository, readReleaseState, short } from "./release.mjs";
import { resolveTrust, runGit } from "./trust.mjs";

const PIN_SCHEMA = "skilliton.pin/1";
const PIN_FILE = "skilliton-pin.json";
const OID_RE = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const MAX_PIN_BYTES = 1024 * 1024;

function validateVersion(version) {
  if (typeof version !== "string" || !VERSION_RE.test(version)) {
    refuse(`--release "${version}" is not a plain MAJOR.MINOR.PATCH version (for example 1.2.0). pin moves between signed release tags and nothing else: it takes no branch, no commit and no other ref. Nothing was changed.`);
  }
}

// The folder git itself keeps for this clone, so a linked worktree records its pin where its own git dir is.
function gitDir(repo) {
  const r = runGit(repo, ["rev-parse", "--absolute-git-dir"]);
  if (!r.ok) throw new Error(`git rev-parse --absolute-git-dir failed (${r.failure}: ${r.stderr.trim()})`);
  return r.stdout.trim();
}

function pinProblem(p) {
  if (!isPlainObject(p) || p.schema !== PIN_SCHEMA) return `schema is not ${PIN_SCHEMA}`;
  if (typeof p.version !== "string" || !VERSION_RE.test(p.version)) return "version is not a MAJOR.MINOR.PATCH version";
  if (typeof p.tagObject !== "string" || !OID_RE.test(p.tagObject)) return "tagObject is not an object id";
  if (typeof p.commit !== "string" || !OID_RE.test(p.commit)) return "commit is not an object id";
  if (typeof p.pinnedAt !== "string" || !p.pinnedAt) return "pinnedAt is missing";
  if (!isPlainObject(p.seen)) return "seen is not an object of version to tag object id";
  for (const [v, oid] of Object.entries(p.seen)) {
    if (!VERSION_RE.test(v) || typeof oid !== "string" || !OID_RE.test(oid)) return `seen.${v} is not a version and an object id`;
  }
  return null;
}

// The clone's pin record, or null when it has never been pinned. A record that does not have the recorded shape is
// refused rather than ignored: ignoring it would silently drop the only memory of where the release tags stood.
function readPin(repo) {
  const path = join(gitDir(repo), PIN_FILE);
  let st;
  try { st = lstatSync(path); } catch (e) {
    if (e.code === "ENOENT" || e.code === "ENOTDIR") return null;
    throw e;
  }
  if (!st.isFile()) refuse(`${tilde(path)} is not a regular file, so this clone's pin cannot be read; remove it by hand. Nothing was changed.`);
  if (st.size > MAX_PIN_BYTES) refuse(`${tilde(path)} is larger than 1 MB, which is not a pin record; remove it by hand. Nothing was changed.`);
  let p;
  try { p = JSON.parse(readFileSync(path, "utf8")); } catch (e) { refuse(`${tilde(path)} is not valid JSON (${e.message}), so where this clone was pinned is unknown; remove it by hand. Nothing was changed.`); }
  const problem = pinProblem(p);
  if (problem) refuse(`${tilde(path)} is not a valid pin record (${problem}), so where this clone was pinned is unknown; remove it by hand. Nothing was changed.`);
  return p;
}

// Written to a new temporary file and renamed, so a record is never half written.
function writePin(path, record) {
  const tmp = `${path}.${process.pid}.tmp`;
  try { unlinkSync(tmp); } catch (e) { if (e.code !== "ENOENT") throw e; }
  writeFileSync(tmp, `${JSON.stringify(record, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  renameSync(tmp, path);
}

// Why a version is not approved, in one phrase, for a refusal that has to be actionable.
function notApprovedBecause(v) {
  if (v.state === "withdrawn") return `it was withdrawn (${v.withdrawal.withdrawReason})`;
  if (!v.approval) return `it has no ${RELEASE_TAG}${v.version} tag${v.manifestFile ? `, only the manifest ${v.manifestFile}` : ""}`;
  if (!v.approval.verified) return v.approval.unchecked ? "its signature was not checked" : v.approval.reason;
  if (v.manifestProblems.length) return v.manifestProblems.join("; ");
  return "it is not approved";
}

// Everything a pin decision needs, read once: the signers, every release tag, the clone's HEAD and its record.
// trustPath lets join check tags against the signers file the person passed on the command line, which is the same
// file it is about to trust; nothing has to be trusted before a first join can refuse an unsigned release.
export function readPinState(repoInput, { company, trustPath } = {}) {
  const { real: repo } = openRepository(repoInput, "--repo");
  const trust = trustPath === undefined ? resolveTrust(company) : { company, path: trustPath };
  const release = readReleaseState(repo, trust);
  const head = runGit(repo, ["rev-parse", "HEAD"]);
  if (!head.ok) refuse(`${tilde(repo)} has no commits yet, so there is nothing to pin. Nothing was changed.`);
  const branch = runGit(repo, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  // A modified tracked file refuses: the runtime the launcher would run is then not the one that was signed. An
  // untracked file is reported and not refused, because it is not part of the release and no manifest names it.
  const modified = runGit(repo, ["status", "--porcelain", "--untracked-files=no"]);
  const untracked = runGit(repo, ["ls-files", "--others", "--exclude-standard"]);
  const seenNow = {};
  for (const v of release.versions) if (v.releaseRef) seenNow[v.version] = v.releaseRef.oid;
  return {
    repo,
    trust,
    versions: release.versions,
    problems: release.problems,
    head: head.stdout.trim(),
    branch: branch.ok ? branch.stdout.trim() : null,
    modified: modified.ok ? modified.stdout.split("\n").filter(Boolean) : [],
    untracked: untracked.ok ? untracked.stdout.split("\n").filter(Boolean).length : 0,
    seenNow,
    pin: readPin(repo),
    pinFile: join(gitDir(repo), PIN_FILE),
  };
}

// A release tag is signed once and never moves. Anything else is a rewritten or hand-made tag, and installing from
// it would install something nobody signed, so it stops the command rather than being noted.
function movedTags(state) {
  const out = [];
  for (const [version, oid] of Object.entries(state.pin?.seen ?? {})) {
    const now = state.seenNow[version];
    if (now === undefined) out.push(`${RELEASE_TAG}${version} was in this clone when it was pinned (${state.pin.pinnedAt}) and is now gone`);
    else if (now !== oid) out.push(`${RELEASE_TAG}${version} was the tag object ${short(oid)} when this clone was pinned (${state.pin.pinnedAt}) and is now ${short(now)}`);
  }
  return out;
}

// What pinning would do, or a refusal. Writes nothing. version undefined means the newest approved release.
export function planPin(state, { version } = {}) {
  const moved = movedTags(state);
  if (moved.length) {
    refuse(`a signed release tag has changed in ${tilde(state.repo)} since it was pinned: ${moved.join("; ")}. A release tag is made once and never moves, so this clone has fetched a rewritten tag or been changed by hand, and what it holds is not what was signed. Nothing was changed. Ask whoever signs releases which tag is right; if it is the new one, remove ${tilde(state.pinFile)} and pin again.`);
  }
  if (version !== undefined) validateVersion(version);
  if (!state.versions.length) {
    refuse(`${tilde(state.repo)} has no release tags, so there is no signed release to pin to. Fetch them (git -C ${tilde(state.repo)} fetch --tags), or ask your company to sign one (${selfCommand()} release sign --version <x.y.z>). Nothing was changed.`);
  }
  let chosen;
  if (version !== undefined) {
    chosen = state.versions.find((v) => v.version === version);
    if (!chosen) refuse(`${tilde(state.repo)} knows no release ${version}; it knows ${state.versions.map((v) => v.version).join(", ")}. Fetch the tags (git -C ${tilde(state.repo)} fetch --tags) if it should be there. Nothing was changed.`);
    if (chosen.state !== "approved") refuse(`release ${version} is not approved: ${notApprovedBecause(chosen)}. pin moves between approved releases only. Nothing was changed.`);
  } else {
    chosen = state.versions[0];
    if (chosen.state !== "approved") {
      const fallback = state.versions.find((v) => v.state === "approved");
      refuse(`the newest release ${tilde(state.repo)} knows, ${chosen.version}, is not approved: ${notApprovedBecause(chosen)}. Rather than quietly installing an older one, this refuses: ${fallback ? `if ${fallback.version} is the one you want, ask for it by name with --release ${fallback.version}` : "no release in this clone is approved"}. Nothing was changed.`);
    }
  }
  if (state.modified.length) {
    refuse(`${tilde(state.repo)} has ${state.modified.length} changed file(s) that git tracks, so what it holds is not release ${chosen.version} even at the right commit, and moving would carry them along. Commit them elsewhere or throw them away (git -C ${tilde(state.repo)} status), then pin again. Nothing was changed.`);
  }
  // Three states, not two. A clone can sit on the release commit and still not be pinned to it: the record is what a
  // later run reads to see that a tag has moved, so a clone at the right commit with no record has the work still to do.
  const atCommit = state.head === chosen.approval.commit;
  const recorded = state.pin?.version === chosen.version && state.pin?.commit === chosen.approval.commit;
  const action = !atCommit ? "checkout" : recorded ? "already" : "record";
  return {
    version: chosen.version,
    tag: chosen.approval.tag,
    tagObject: chosen.releaseRef.oid,
    commit: chosen.approval.commit,
    signer: chosen.approval.signer,
    action,
    from: state.pin ? `release ${state.pin.version}` : state.branch ? `branch ${state.branch}` : `commit ${short(state.head)}`,
  };
}

// One line saying where the clone stands, for join and for pin alike.
export function pinLine(state, plan) {
  const where = plan.action === "already" ? "pinned at"
    : plan.action === "record" ? "already at, and will be recorded as"
    : `will move from ${plan.from} to`;
  const who = plan.signer?.principal ? `, signed by ${plan.signer.principal}` : "";
  return `release: ${where} ${plan.version} (${plan.tag}, commit ${short(plan.commit)}${who})`;
}

// Every release the clone knows, newest first, for the status view.
export function releaseLines(state) {
  return state.versions.map((v) => {
    const at = v.approval?.commit ? ` commit ${short(v.approval.commit)}` : "";
    const why = v.state === "approved" ? (v.approval.signer?.principal ? ` signed by ${v.approval.signer.principal}` : "") : `: ${notApprovedBecause(v)}`;
    return `  ${v.state.padEnd(12)}${v.version.padEnd(10)}${at}${why}`;
  });
}

// Moves the clone and records the pin. Returns { failed } so a caller can report a git failure as one.
export function applyPin(state, plan, { say }) {
  if (plan.action === "checkout") {
    const r = runGit(state.repo, ["checkout", "--detach", plan.commit]);
    if (!r.ok) return { failed: `git checkout --detach ${short(plan.commit)} in ${tilde(state.repo)} failed (${r.failure}: ${r.stderr.trim().split("\n").filter(Boolean).pop() ?? "no output"})` };
    say(`  moved ${tilde(state.repo)} to ${plan.tag}, commit ${short(plan.commit)}`);
  }
  writePin(state.pinFile, {
    schema: PIN_SCHEMA,
    company: state.trust.company ?? null,
    version: plan.version,
    tag: plan.tag,
    tagObject: plan.tagObject,
    commit: plan.commit,
    from: plan.from,
    seen: state.seenNow,
    pinnedAt: new Date().toISOString(),
  });
  return { failed: null };
}
