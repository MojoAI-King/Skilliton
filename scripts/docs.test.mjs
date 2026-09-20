#!/usr/bin/env node
// docs.test.mjs: keeps the guides people follow in step with the command line and the files they point at.
//
// Found on 2026-09-16: README.md and docs/RELEASING.md told a company to run `new-skill <plugin> <skill> --pack
// <company>`, which refused on a fresh fork because no command created the plugin; the test for new-skill built the
// plugin folder by hand, so the documented path had never run as written. This test holds the guides to what exists:
//   - every `skilliton <command> [<verb>]` in a code span or code block of the guides names a command the CLI lists,
//     and, for a command whose --help lists verbs (such as release create), a verb it lists
//   - every relative Markdown link in the guides resolves to a file or folder in the checkout
//   - every Markdown file under docs/, and README.md, says its Kind near the top
//   - every Markdown file under docs/ is reachable from docs/AUTOPILOT_START_HERE.md by following relative links, so
//     one index reaches every document and a new document cannot be written where nothing points at it
//   - every Markdown file under docs/archive/ says Kind: Reference, because that folder holds superseded documents
// It does not show that a command does what the prose says; the rehearsals under scripts/rehearsals/ do that.
//
//   node scripts/docs.test.mjs              check this repository
//   node scripts/docs.test.mjs --root D     check another checkout (the command line is always this repository's)
//   node scripts/docs.test.mjs --self-test  prove each check can fail

import { spawnSync } from "node:child_process";
import { appendFileSync, cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const CLI = join(here, "skilliton.mjs");
const GUIDES = ["README.md", "docs/HOW-IT-WORKS.md", "docs/ONBOARDING.md", "docs/RELEASING.md"];
const argv = process.argv.slice(2);
const rootArg = argv.includes("--root") ? argv[argv.indexOf("--root") + 1] : null;
if (argv.includes("--root") && (!rootArg || rootArg.startsWith("--"))) { console.error("--root needs a folder; nothing was checked"); process.exit(2); }

function helpOf(args) {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", env: { ...process.env, SKILLITON_SELF: "skilliton" } });
  if (r.status !== 0) throw new Error(`node scripts/skilliton.mjs ${args.join(" ")} exited ${r.status}: ${r.stderr}`);
  return r.stdout;
}
const COMMANDS = new Set([...helpOf(["--help"]).matchAll(/^ {2}([a-z][a-z-]*) {2,}/gm)].map((m) => m[1]));
const verbCache = new Map();
// The verbs a command's help lists as usage lines ("  release create --version ..."); empty for a command without verbs.
function verbsOf(command) {
  if (!verbCache.has(command)) {
    const pattern = new RegExp(`^\\s*${command} ([a-z][a-z-]*)\\b`, "gm");
    verbCache.set(command, new Set([...helpOf([command, "--help"]).matchAll(pattern)].map((m) => m[1])));
  }
  return verbCache.get(command);
}

// Split a Markdown file into code (fenced blocks and inline spans) and prose, line by line. A `text` block (a folder
// tree, sample output) holds no commands, so it is neither.
function parts(text) {
  const code = [], prose = [];
  let fence = null, plain = false;
  text.split("\n").forEach((line, i) => {
    const marker = /^\s*(```+|~~~+)\s*([A-Za-z]*)/.exec(line);
    if (marker) {
      if (!fence) { fence = marker[1][0]; plain = marker[2] === "text"; }
      else if (marker[1][0] === fence) fence = null;
      return;
    }
    if (fence) { if (!plain) code.push({ line: i + 1, text: line }); return; }
    for (const m of line.matchAll(/`([^`]+)`/g)) code.push({ line: i + 1, text: m[1] });
    prose.push({ line: i + 1, text: line.replace(/`[^`]*`/g, "") });
  });
  return { code, prose };
}

function markdownFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...markdownFiles(p));
    else if (name.endsWith(".md")) out.push(p);
  }
  return out;
}

// Every Markdown file a reader arrives at by starting from the index and following relative links. A link to a folder
// counts as a link to every Markdown file under it, which is how the record folders index themselves: docs/tasks/ is
// one file per task and the folder is the list. A link into a file this walk has not reached is still followed, so a
// document reachable only through README.md or PLAN.md is not counted as reachable from the index by accident.
function reachableFrom(root, startRel) {
  const seen = new Set();
  const queue = [join(root, startRel)];
  while (queue.length) {
    const file = queue.shift();
    const rel = relative(root, file);
    if (seen.has(rel)) continue;
    seen.add(rel);
    if (!file.endsWith(".md") || !existsSync(file)) continue;
    const { prose } = parts(readFileSync(file, "utf8"));
    for (const { text } of prose) {
      for (const m of text.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
        const target = m[1];
        if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("#")) continue;
        const path = resolve(dirname(file), decodeURIComponent(target.split("#")[0]));
        if (!existsSync(path)) continue;
        if (statSync(path).isDirectory()) { queue.push(...markdownFiles(path)); continue; }
        queue.push(path);
      }
    }
  }
  return seen;
}

function check(root) {
  const failures = [], oks = [];
  let commands = 0, links = 0;
  for (const rel of GUIDES) {
    const file = join(root, rel);
    if (!existsSync(file)) { failures.push(`${rel}: missing (the guides this test checks are ${GUIDES.join(", ")})`); continue; }
    const { code, prose } = parts(readFileSync(file, "utf8"));
    for (const { line, text } of code) {
      for (const m of text.matchAll(/(?:^|[\s"'(])(?:skilliton|scripts\/skilliton\.mjs|bin\/skilliton)[ \t]+([a-z][a-z-]*)(?:[ \t]+([a-z][a-z-]*))?/g)) {
        commands++;
        const [, command, verb] = m;
        if (!COMMANDS.has(command)) { failures.push(`${rel}:${line}: "skilliton ${command}" is not a command (skilliton --help lists ${[...COMMANDS].join(", ")})`); continue; }
        const verbs = verbsOf(command);
        if (verb && verbs.size && !verbs.has(verb)) failures.push(`${rel}:${line}: "skilliton ${command} ${verb}": ${command} has no verb "${verb}" (its help lists ${[...verbs].join(", ")})`);
      }
    }
    for (const { line, text } of prose) {
      for (const m of text.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
        const target = m[1];
        if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("#")) continue;
        links++;
        const path = resolve(dirname(file), decodeURIComponent(target.split("#")[0]));
        if (!existsSync(path)) failures.push(`${rel}:${line}: the link to ${target} does not resolve (${relative(root, path)} does not exist)`);
      }
    }
  }
  oks.push(`${commands} skilliton command mention(s) in ${GUIDES.length} guides name real commands and verbs`);
  oks.push(`${links} relative link(s) in the guides resolve`);
  const docs = [join(root, "README.md"), ...(existsSync(join(root, "docs")) ? markdownFiles(join(root, "docs")) : [])].filter(existsSync);
  for (const file of docs) {
    const head = readFileSync(file, "utf8").split("\n").slice(0, 8).join("\n");
    if (!/(^|\s)Kind: [A-Z][a-z]+\b/.test(head)) failures.push(`${relative(root, file)}: no Kind label in its first 8 lines (Kind: Living. or Kind: Reference.; see docs/MAINTAIN.md)`);
  }
  oks.push(`${docs.length} Markdown file(s) under docs/ and README.md checked for a Kind label`);

  const INDEX = join("docs", "AUTOPILOT_START_HERE.md");
  const docsDir = join(root, "docs");
  if (!existsSync(join(root, INDEX))) {
    oks.push(`reachability NOT CHECKED: this checkout has no ${INDEX}, which is this repository's index`);
  } else {
    const reached = reachableFrom(root, INDEX);
    const under = existsSync(docsDir) ? markdownFiles(docsDir).map((f) => relative(root, f)) : [];
    const lost = under.filter((p) => !reached.has(p)).sort();
    for (const p of lost) failures.push(`${p}: nothing reaches it from ${INDEX} (link it from the index, or from a document the index already reaches; a folder link counts as a link to every Markdown file under it)`);
    oks.push(`${under.length - lost.length} of ${under.length} Markdown file(s) under docs/ are reachable from ${INDEX}`);
  }

  const archive = join(root, "docs", "archive");
  const archived = existsSync(archive) ? markdownFiles(archive) : [];
  for (const file of archived) {
    const head = readFileSync(file, "utf8").split("\n").slice(0, 8).join("\n");
    if (!/(^|\s)Kind: Reference\b/.test(head)) failures.push(`${relative(root, file)}: under docs/archive/ but not labelled Kind: Reference (that folder holds superseded documents; a document still in use does not belong there)`);
  }
  oks.push(`${archived.length} archived document(s) under docs/archive/ carry a Kind: Reference label`);
  return { failures, oks };
}

if (argv.includes("--self-test")) {
  const repo = resolve(here, "..");
  const clean = check(repo);
  if (clean.failures.length) { console.log(`SELF-TEST NOT RUN: this repository fails its own checks first:\n  ${clean.failures.join("\n  ")}`); process.exit(1); }
  const tmp = mkdtempSync(join(tmpdir(), "docs-selftest-"));
  const add = (d, rel, text) => appendFileSync(join(d, rel), text);
  const cases = [
    ["an unknown command", (d) => add(d, "docs/HOW-IT-WORKS.md", "\nRun `skilliton frobnicate --apply`.\n"), /"skilliton frobnicate" is not a command/],
    ["an unknown verb", (d) => add(d, "docs/RELEASING.md", "\n```bash\nnode scripts/skilliton.mjs release publish 1.0.0\n```\n"), /release has no verb "publish"/],
    ["a broken link", (d) => add(d, "README.md", "\nSee [the missing page](docs/NOWHERE.md).\n"), /link to docs\/NOWHERE\.md does not resolve/],
    ["a missing Kind label", (d) => { const f = join(d, "docs/ONBOARDING.md"); writeFileSync(f, readFileSync(f, "utf8").replace(/Kind: [A-Z][a-z]+\./, "")); }, /ONBOARDING\.md: no Kind label/],
    ["a document nothing links to", (d) => writeFileSync(join(d, "docs/ORPHAN.md"), "# Orphan\n\nKind: Living.\n"), /docs\/ORPHAN\.md: nothing reaches it/],
    ["a living document filed under docs/archive/", (d) => writeFileSync(join(d, "docs/archive/STILL_LIVING.md"), "# Still living\n\nKind: Living.\n"), /STILL_LIVING\.md: under docs\/archive\/ but not labelled Kind: Reference/],
  ];
  let pass = 0;
  for (const [label, mutate, expect] of cases) {
    const d = join(tmp, label.replace(/\W+/g, "-"));
    cpSync(repo, d, { recursive: true, filter: (s) => {
      const p = relative(repo, s).split(sep);
      return !p.includes(".git") && !p.includes("node_modules") && !(p[0] === ".claude" && p[1] === "worktrees");
    } });
    mutate(d);
    const caught = check(d).failures.some((f) => expect.test(f));
    console.log(`${caught ? "ok  " : "FAIL"} self-test: ${label} is ${caught ? "caught" : "NOT caught"}`);
    if (caught) pass++;
  }
  rmSync(tmp, { recursive: true, force: true });
  console.log(pass === cases.length ? "self-test passed: every docs check can fail" : `SELF-TEST FAIL: ${cases.length - pass} check(s) could not fail`);
  process.exit(pass === cases.length ? 0 : 1);
}

const root = resolve(rootArg ?? join(here, ".."));
const { failures, oks } = check(root);
for (const m of oks) console.log(`ok   ${m}`);
for (const m of failures) console.log(`FAIL ${m}`);
console.log(failures.length ? `\n${failures.length} docs failure(s)` : "\ndocs checks passed");
process.exit(failures.length ? 1 : 0);
