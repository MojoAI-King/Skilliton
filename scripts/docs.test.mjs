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
//   - every Markdown file under docs/ is reachable from docs/README.md by following relative links, so
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
// The assistant clients this repository could plausibly be read as claiming. Hand-kept and short on purpose: the point
// is to catch a name arriving in README.md ahead of the evidence, not to recognize every tool that exists. Add a name
// here when it becomes one this repository might be read as supporting.
const CLIENT_NAMES = ["Claude Code", "Codex", "Cursor", "Windsurf", "Zed", "GitHub Copilot", "Copilot", "Gemini CLI", "Aider", "JetBrains"];
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

  // B43: the offline check list lives in .github/workflows/checks.yml only; scripts/checks.mjs and CI both read it.
  // docs/MAINTAIN.md step 2 points at it and names no check script, because a second copy is how the lists forked.
  const maintainPath = join(root, "docs", "MAINTAIN.md"), ciPath = join(root, ".github", "workflows", "checks.yml");
  if (existsSync(maintainPath) && existsSync(ciPath)) {
    const scriptsIn = (text) => new Set([...text.matchAll(/scripts\/[a-z0-9-]+\.(?:test\.)?(?:mjs|sh)\b/g)].map((m) => m[0]));
    const lines = readFileSync(maintainPath, "utf8").split("\n");
    const from = lines.findIndex((l) => /^2\. /.test(l)), to = lines.findIndex((l, i) => i > from && /^3\. /.test(l));
    const step2 = from >= 0 ? scriptsIn(lines.slice(from, to > from ? to : undefined).join("\n")) : new Set();
    const ci = scriptsIn(readFileSync(ciPath, "utf8"));
    // The runner that reads the list and this test that holds it to one copy are named on purpose.
    for (const s of step2) if (s !== "scripts/checks.mjs" && s !== "scripts/docs.test.mjs") failures.push(`docs/MAINTAIN.md step 2 names ${s}; the check list is .github/workflows/checks.yml alone, so name the file, not the scripts in it`);
    if (!/\.github\/workflows\/checks\.yml/.test(lines.slice(from, to > from ? to : undefined).join("\n"))) failures.push("docs/MAINTAIN.md step 2 does not point at .github/workflows/checks.yml, the one list of offline checks");
    oks.push(`docs/MAINTAIN.md step 2 points at checks.yml, the one list (${ci.size} check script(s) in it)`);
  } else {
    oks.push("check-list agreement NOT CHECKED: docs/MAINTAIN.md or .github/workflows/checks.yml is absent in this checkout");
  }

  const INDEX = join("docs", "README.md");
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

  // The supported-client rule (docs/CLIENTS.md, batch 03-05). README.md is the page a reader believes, so a client
  // named there must have a column in the matrix. The rule's other half, at least one measured row, is read by a
  // person: this check reports which columns have one and does not decide for them, because "measured" is a judgement
  // about evidence and a test that guessed at it would be the wrong kind of certain.
  const clientsFile = join(root, "docs", "CLIENTS.md");
  if (!existsSync(clientsFile)) failures.push(`docs/CLIENTS.md: missing, so no client column can be read and the supported-client rule cannot be checked`);
  else {
    const clientsText = readFileSync(clientsFile, "utf8");
    const rows = clientsText.split("\n").filter((l) => l.trimStart().startsWith("|"));
    const header = rows.find((l) => /^\|\s*Behavior\b/.test(l.trim()));
    if (!header) failures.push(`docs/CLIENTS.md: no matrix header row starting "| Behavior" was found, so the client columns could not be read`);
    else {
      const columns = header.split("|").slice(2, -1).map((c) => c.trim()).filter(Boolean);
      // "not measured" and "never measured" are how a cell says it holds no evidence, so a column whose every cell
      // says that has no measured row. The negations come out before the word is looked for, or a client nobody has
      // ever run would be counted as one that has been, which is the exact claim this rule exists to stop.
      const hasMeasured = (cell) => /measured/i.test(String(cell ?? "").replace(/\b(?:not|never|no)\s+(?:\w+\s+){0,2}measured\b/gi, ""));
      const measured = columns.filter((_, i) => rows.some((r) => hasMeasured(r.split("|").slice(2, -1)[i])));
      const carried = (name) => columns.some((c) => c.toLowerCase().includes(name.toLowerCase()));
      const readme = join(root, "README.md");
      let named = 0;
      if (!existsSync(readme)) failures.push(`README.md: missing, so the clients it names could not be read`);
      else {
        readFileSync(readme, "utf8").split("\n").forEach((text, i) => {
          for (const name of CLIENT_NAMES) {
            if (!new RegExp(`(^|[^\\w-])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\w-]|$)`, "i").test(text)) continue;
            named++;
            if (!carried(name)) failures.push(`README.md:${i + 1}: names the client "${name}", which docs/CLIENTS.md does not carry a column for (its columns are ${columns.join("; ")}). A client is supported only with a column and at least one measured row: add the column with what is actually known, or do not name it here`);
          }
        });
      }
      oks.push(`${named} client mention(s) in README.md name a client docs/CLIENTS.md carries: ${columns.length} column(s), ${measured.length} with a measured row (${measured.join("; ") || "none"})`);
    }
  }
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
    ["a client README claims but the matrix does not carry", (d) => add(d, "README.md", "\nSkilliton also runs in Windsurf.\n"), /names the client "Windsurf", which docs\/CLIENTS\.md does not carry a column for/],
    ["MAINTAIN step 2 naming a check script again", (d) => { const f = join(d, "docs/MAINTAIN.md"); writeFileSync(f, readFileSync(f, "utf8").replace(/^2\. (.*)$/m, "2. $1 Also run `node scripts/phantom.test.mjs`.")); }, /MAINTAIN\.md step 2 names scripts\/phantom\.test\.mjs; the check list is/],
    ["MAINTAIN step 2 no longer pointing at checks.yml", (d) => { const f = join(d, "docs/MAINTAIN.md"); writeFileSync(f, readFileSync(f, "utf8").replace(/^2\. .*$/m, "2. **Run the offline checks.**")); }, /step 2 does not point at \.github\/workflows\/checks\.yml/],
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
