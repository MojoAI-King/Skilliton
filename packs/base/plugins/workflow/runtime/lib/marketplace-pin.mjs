// marketplace-pin.mjs: moving this machine's company marketplace in Claude Code to a signed release tag, for
// `skilliton pin` and `skilliton join`, and the neutral folder every client command runs from.
//
// Measured on Claude Code 2.1.278 (evidence/live/2026-09-23-marketplace-pinned-at-a-release-tag.md): a marketplace
// source takes #<branch or tag>, as owner/repo#<tag> for a GitHub source and <url>#<tag> for a git source, and never
// a commit (the ref goes to a branch-or-tag clone); an update keeps the clone on the tag; moving between tags is a
// remove and an add; and `claude plugin marketplace list --json` reports { name, source: "github", repo, ref,
// installLocation }. A git source and a folder source are read from that list in the same flat shape, which was not
// measured for them.
//
// What this pins, and what it does not. A tag is a name: whoever can move it on the remote moves every machine that
// follows it, and the client cannot follow a commit. The pin narrows what a machine downloads; verify, against the
// signed manifest, decides what it trusts, and stays the check.
//
// The neutral folder. The client's marketplace remove, run inside a repository, also empties that repository's
// .claude/settings.json plugin entries (docs/lessons/2026-09-23-a-client-s-marketplace-remove-run-inside-0ef4.md).
// So every client command here runs from a new empty temporary folder, which is removed when the command ends, and a
// temporary folder that sits inside a repository is refused rather than used.
//
// Node built-ins only; the client is run with argument arrays and no shell.

import { spawnSync } from "node:child_process";
import { accessSync, constants as fsConstants, existsSync, lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { isPlainObject, refuse, tilde, which } from "./core.mjs";
import { RELEASE_TAG, readClaudeCatalog } from "./release.mjs";
import { claudeConfigDir, readClaudeInstalls } from "./verify.mjs";

const CLIENT_TIMEOUT_MS = 300000;
const GIT_KINDS = ["github", "git"];

export const releaseTag = (version) => `${RELEASE_TAG}${version}`;

// ---------- the neutral folder ----------

// The first folder at or above dir that is a repository, or holds project settings the client would act on, or null.
// Claude Code's own configuration folder is where user settings live, so it is not counted as a project.
function projectAround(dir) {
  const config = realOrSelf(claudeConfigDir());
  for (let at = dir; ; at = dirname(at)) {
    if (existsSync(join(at, ".git"))) return at;
    if (existsSync(join(at, ".claude", "settings.json")) && realOrSelf(join(at, ".claude")) !== config) return at;
    if (dirname(at) === at) return null;
  }
}

function realOrSelf(path) {
  try { return realpathSync(path); } catch { return resolve(path); }
}

// Runs fn(folder) with a new empty folder made for it, and removes the folder afterwards, whatever fn did.
function inNeutralFolder(fn) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "skilliton-client-")));
  try {
    const around = projectAround(dir);
    if (around) {
      refuse(`the temporary folder ${tilde(dir)} is inside ${tilde(around)}, which is a repository or holds project settings, and a client `
        + "command run there can change them. Set TMPDIR to a folder outside every repository. Nothing was changed.");
    }
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// One client command, run from a neutral folder. Returns { ok, failure, stdout, output }; never throws for the
// client's own failure.
function runClient(binary, args) {
  const r = inNeutralFolder((cwd) => spawnSync(binary.path, args, {
    cwd, encoding: "utf8", timeout: CLIENT_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"],
  }));
  const failure = r.error ? (r.error.code === "ETIMEDOUT" ? `timed out after ${CLIENT_TIMEOUT_MS / 1000}s` : r.error.message)
    : r.status !== 0 ? `exit ${r.status ?? `by signal ${r.signal}`}` : null;
  return { ok: failure === null, failure, stdout: r.stdout ?? "", output: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() };
}

// The claude binary to drive: the executable given with --claude, else the one on PATH, else null. Found, not run.
function findClaude(explicit) {
  if (explicit === undefined) {
    const path = which("claude");
    return path ? { path, explicit: false } : null;
  }
  const path = resolve(explicit);
  let ok = false;
  try { ok = !lstatSync(path).isDirectory(); accessSync(path, fsConstants.X_OK); } catch { ok = false; }
  if (!ok) refuse(`--claude ${tilde(path)} is not an executable file. Nothing was changed.`);
  return { path, explicit: true };
}

const shown = (binary, args) => `${binary?.explicit ? tilde(binary.path) : "claude"} ${args.join(" ")}`;

// ---------- sources ----------

// A marketplace source in one flat shape, from either known_marketplaces.json's source object or a list entry:
// { kind, repo?, url?, path?, ref }.
function flatSource(s) {
  if (!isPlainObject(s)) return { kind: "unknown", ref: null };
  const kind = typeof s.source === "string" ? s.source : "unknown";
  const text = (v) => (typeof v === "string" && v ? v : null);
  return { kind, repo: text(s.repo), url: text(s.url), path: text(s.path), ref: text(s.ref) };
}

// The source as the client takes it back, without a ref: owner/repo for GitHub, the URL for git, else null.
function plainSource(source) {
  if (source.kind === "github") return source.repo ?? null;
  if (source.kind === "git") return source.url ?? null;
  return null;
}

// The source at a release tag, owner/repo#<tag> or <url>#<tag>; null when the source is not a git source.
function sourceAtTag(source, tag) {
  const plain = GIT_KINDS.includes(source.kind) ? plainSource(source) : null;
  return plain ? `${plain}#${tag}` : null;
}

const describeSource = (s) => (s.kind === "github" ? `GitHub ${s.repo}` : s.kind === "git" ? `git ${s.url}`
  : s.kind === "directory" ? `the folder ${s.path ? tilde(s.path) : "(unknown)"}` : `a ${s.kind} source`);
const refText = (s) => (s.ref ? `at ${s.ref}` : "following its default branch (no ref)");

// Claude Code's own record of its marketplaces, read without running it: { map } or { problem }.
function readKnown(home) {
  const path = join(home, "plugins", "known_marketplaces.json");
  if (!existsSync(path)) return { map: new Map() };
  let value;
  try { value = JSON.parse(readFileSync(path, "utf8")); } catch (e) { return { problem: `${tilde(path)} is not valid JSON (${e.message})` }; }
  if (!isPlainObject(value)) return { problem: `${tilde(path)} does not hold an object` };
  return { map: new Map(Object.entries(value).map(([name, m]) => [name, flatSource(m?.source)])) };
}

// The output of `claude plugin marketplace list --json`: { map } or { problem }. Read as an array of entries, the way
// lib/doctor.mjs reads it; an object holding such an array under "marketplaces" is read too.
function parseList(stdout) {
  let value;
  try { value = JSON.parse(stdout); } catch (e) { return { problem: `its output is not JSON (${e.message})` }; }
  const list = Array.isArray(value) ? value : Array.isArray(value?.marketplaces) ? value.marketplaces : null;
  if (!list) return { problem: "its output is not a list of marketplaces" };
  return { map: new Map(list.filter((m) => isPlainObject(m) && typeof m.name === "string").map((m) => [m.name, flatSource(m)])) };
}

// ---------- the plan ----------

// Everything a marketplace pin needs, read from files, running nothing: the company marketplace's name (the catalog
// name join registers), where Claude Code has it from, the plugins installed from it, and the client to run.
export function readMarketplacePin(repo, { claude } = {}) {
  const home = claudeConfigDir();
  const binary = findClaude(claude);
  let name;
  try { name = readClaudeCatalog(repo).name; } catch (e) { return { home, binary, problem: `the clone's catalog cannot be read (${e.message})` }; }
  const known = readKnown(home);
  if (known.problem) return { home, binary, name, problem: known.problem };
  return { home, binary, name, source: known.map.get(name) ?? null };
}

// The commands that move the marketplace to the tag, in order, as argument arrays.
function moveCommands(mp, tag, userInstalls) {
  return [
    ["plugin", "marketplace", "remove", mp.name],
    ["plugin", "marketplace", "add", sourceAtTag(mp.source, tag)],
    ...userInstalls.map((id) => ["plugin", "update", id]),
  ];
}

// The plugins installed from the marketplace, split into the user scope a machine-wide move updates and the rest.
function installsOf(mp) {
  const r = readClaudeInstalls(mp.home);
  const mine = r.installs.filter((i) => i.marketplace === mp.name);
  return {
    invalid: r.invalid,
    user: [...new Set(mine.filter((i) => i.scope === "user").map((i) => i.id))],
    other: mine.filter((i) => i.scope !== "user").map((i) => `${i.id} (${i.scope ?? "unknown"} scope)`),
  };
}

// What moving the marketplace to tag means, from files alone: { state, lines, commands }. state is one of
// "absent", "unreadable", "not-pinnable", "already", "move".
export function planMarketplacePin(mp, tag) {
  const where = `Claude Code (${tilde(mp.home)})`;
  if (mp.problem) return { state: "unreadable", lines: [`marketplace: cannot tell where ${where} has the company one: ${mp.problem}`] };
  if (!mp.source) return { state: "absent", lines: [`marketplace: ${mp.name} is not added to ${where}; nothing to move (join adds it)`] };
  const from = `marketplace: ${mp.name} in ${where} is from ${describeSource(mp.source)}`;
  if (!sourceAtTag(mp.source, tag)) {
    return { state: "not-pinnable", lines: [`${from}, which is not a git source, so it cannot be pinned to ${tag}: it follows what the folder holds`] };
  }
  const installs = installsOf(mp);
  if (mp.source.ref === tag) return { state: "already", installs, lines: [`${from}, already at ${tag}`] };
  const commands = moveCommands(mp, tag, installs.user);
  const lines = [`${from}, ${refText(mp.source)}; it will move to ${tag} (a tag, not a commit), each command run from a new empty folder:`];
  for (const c of commands) lines.push(`  ${shown(mp.binary, c)}`);
  if (installs.invalid.length) lines.push(`  note: some install records cannot be read (${installs.invalid.join("; ")}); the updates may be incomplete`);
  for (const o of installs.other) lines.push(`  not moved from here: ${o}; update it from inside that project with claude plugin update`);
  return { state: "move", installs, commands, lines };
}

// One line saying where the company marketplace stands in Claude Code, for the status view.
export function marketplaceStatus(mp) {
  const where = `Claude Code (${tilde(mp.home)})`;
  if (mp.problem) return `marketplace: cannot tell where ${where} has the company one: ${mp.problem}`;
  if (!mp.source) return `marketplace: ${mp.name} is not added to ${where}`;
  return `marketplace: ${mp.name} in ${where} is from ${describeSource(mp.source)}, ${refText(mp.source)}`;
}

// The same commands for a person to run by hand, when there is no client to run them.
export function manualLines(mp, plan) {
  if (plan.state !== "move") return [];
  return [
    "Run these by hand, from an empty folder that is not a project (the client's remove also empties the plugin",
    "settings of a project it runs in), for example after: cd \"$(mktemp -d)\"",
    ...plan.commands.map((c) => `  claude ${c.join(" ")}`),
  ];
}

// ---------- applying ----------

const failed = (binary, args, r) => `${shown(binary, args)} failed (${r.failure}: ${r.output.slice(-600) || "no output"})`;

// Reads the client's marketplaces with list --json: { entry } (null when it is not added) or { problem }.
function listed(mp) {
  const args = ["plugin", "marketplace", "list", "--json"];
  const r = runClient(mp.binary, args);
  if (!r.ok) return { problem: failed(mp.binary, args, r) };
  const parsed = parseList(r.stdout);
  if (parsed.problem) return { problem: `${shown(mp.binary, args)}: ${parsed.problem}` };
  return { entry: parsed.map.get(mp.name) ?? null };
}

// Removes the marketplace and adds it back at the tag, then checks that the client reports that ref. When the client
// refuses the tag form, the marketplace is added back without the ref so the machine is not left without it.
// Returns { code, lines }: 0 moved, 3 a command failed or the ref did not land.
function moveToTag(mp, source, tag, say) {
  const remove = ["plugin", "marketplace", "remove", mp.name];
  const r1 = runClient(mp.binary, remove);
  if (!r1.ok) return { code: 3, lines: [`FAILED: ${failed(mp.binary, remove, r1)}. The marketplace was not moved.`] };
  say(`  removed marketplace ${mp.name}`);
  const add = ["plugin", "marketplace", "add", sourceAtTag(source, tag)];
  const r2 = runClient(mp.binary, add);
  if (!r2.ok) {
    const back = ["plugin", "marketplace", "add", plainSource(source)];
    const r3 = runClient(mp.binary, back);
    return { code: 3, lines: [
      `NOT PINNED: ${failed(mp.binary, add, r2)}.`,
      r3.ok ? `The marketplace was added back without the ref (${shown(mp.binary, back)}), so it follows its branch again. `
        + "Update the client, then run pin again."
        : `Adding it back without the ref failed too (${failed(mp.binary, back, r3)}); this machine now has no ${mp.name} marketplace. `
        + `Add it by hand: ${shown(mp.binary, back)}`,
    ] };
  }
  say(`  added marketplace ${mp.name} at ${tag}`);
  const after = listed(mp);
  if (after.problem) return { code: 3, lines: [`FAILED: the marketplace was added, but reading it back failed: ${after.problem}`] };
  const reported = after.entry?.ref ?? null;
  if (reported !== tag) {
    const what = after.entry ? (reported ? `the ref ${reported}` : "no ref") : `no marketplace named ${mp.name}`;
    const list = shown(mp.binary, ["plugin", "marketplace", "list", "--json"]);
    return { code: 3, lines: [`FAILED: after ${shown(mp.binary, add)}, the client reports ${what}, not ${tag}. The marketplace is not pinned; read ${list}.`] };
  }
  say(`  the client reports ${mp.name} at ${tag}`);
  return { code: 0, lines: [] };
}

// Brings each user-scope plugin that was installed from the marketplace to the tag's version: an update when the
// install record is still there after the move, an install when the remove took it away (whether it does is not
// measured). Returns { code, lines }.
function updatePlugins(mp, before, say) {
  const now = installsOf(mp);
  for (const id of before) {
    const args = now.user.includes(id) ? ["plugin", "update", id] : ["plugin", "install", id];
    const r = runClient(mp.binary, args);
    if (!r.ok) return { code: 3, lines: [`FAILED: ${failed(mp.binary, args, r)}. The marketplace is at the tag; run pin again to finish.`] };
    say(`  ${args[1] === "update" ? "updated" : "installed again"} ${id}`);
  }
  return { code: 0, lines: [] };
}

// Moves the marketplace for a planned "move" or "already" state. The client's own list decides, not the files the
// plan was read from. Returns { code, lines }: 0 done, 1 attention, 3 a command failed or the ref did not land.
export function applyMarketplacePin(mp, plan, tag, { say }) {
  const now = listed(mp);
  if (now.problem) return { code: 3, lines: [`FAILED: ${now.problem}. The marketplace was not moved.`] };
  if (!now.entry) return { code: 1, lines: [`the client does not list ${mp.name}, although its files did; nothing was moved.`] };
  if (!sourceAtTag(now.entry, tag)) return { code: 1, lines: [`the client lists ${mp.name} from ${describeSource(now.entry)}, which cannot be pinned.`] };
  const before = plan.installs?.user ?? [];
  if (now.entry.ref !== tag) {
    const moved = moveToTag(mp, now.entry, tag, say);
    if (moved.code) return moved;
  } else say(`  the client already has ${mp.name} at ${tag}`);
  return updatePlugins(mp, before, say);
}
