#!/usr/bin/env node
// deadcode.mjs: exports nothing imports, and blocks that repeat (report card area 06 batch 04).
//
// The lint (scripts/lint.test.mjs) reads one file at a time: it finds an import that names something the file never
// uses. This reads the modules against each other, which is where the other half of the problem lives. The finding
// that named this batch was of exactly that shape: splitting lib/core.mjs left `KNOWN_CONFIG_SECTIONS` in
// lib/doctor.mjs as a re-export alias nothing imported, because the one command that needs that table takes it from
// lib/config.mjs directly. No single-file rule can see that, because inside doctor.mjs the name was used: it was
// exported.
//
// Two scanners:
//
//   unimported-export   a name exported by a plugin runtime module that nothing in the repository reaches
//   duplicate-block     DUPLICATE_LINES or more consecutive meaningful lines that appear in more than one place,
//                       after whitespace, comments and blank lines are removed
//
// Plain Node, no dependencies, same as the lint: docs/IT-ALLOWLIST.md line 81 promises an IT department that nothing
// here installs anything, and a scanner that needed a parser from a registry would make that page false. So the
// reading below is regular expressions over text, not a syntax tree, and every shape it cannot read is counted and
// printed rather than passed over. A module this scanner cannot follow is never reported as dead.
//
//   node scripts/deadcode.mjs               exit 0 when nothing is found, 1 when something is, 2 when it cannot run
//   node scripts/deadcode.mjs --self-test   proves each scanner finds known-bad input and passes known-good input

import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");

// Where an export is looked at. Scripts, hooks and fixtures are read as importers, never as subjects: a test helper
// that nothing imports yet is not the defect this batch is about.
const RUNTIME_RE = /^packs\/[^/]+\/plugins\/[^/]+\/runtime\/.*\.mjs$/;

// How many consecutive meaningful lines make a duplicate worth naming. Measured over the runtime rather than chosen:
// at 5 the findings are `const x = ...` boilerplate (10 of them), at 7 they are two real copies and nothing else, and
// at 9 nothing repeats at all. The bar is the length at which a repeat stops being coincidence, so it is 7, and the
// tree fails it today rather than passing a bar set above what is there.
export const DUPLICATE_LINES = 7;

// A module loaded by a path its loader computes, so no import statement names it. Each row names the loader, the
// exports it calls, and what else holds the contract up, because a suppression with no reason is a hole.
export const LOADER_CONTRACTS = [
  {
    match: /^packs\/[^/]+\/plugins\/[^/]+\/runtime\/commands\/[^/]+\.mjs$/,
    names: ["help", "run"],
    why: "runtime/skilliton.mjs builds the path from the command name and calls mod.run and mod.help; the command-shape rule in scripts/lint.test.mjs fails when either is missing",
  },
];

// A function whose own body computes a module path from its arguments. The capture groups give the module file and
// the export name, in that order.
export const NAMED_LOADERS = [
  {
    call: /\bloadOptional\(\s*["']([^"']+\.mjs)["']\s*,\s*["']([A-Za-z_$][\w$]*)["']/g,
    dir: "lib",
    why: "lib/lifecycle.mjs loadOptional(file, exportName) resolves ./<file> against its own folder and calls mod[exportName]",
  },
];

// An export with no importer that stays on purpose. Each row is [path, name, reason] and names a backlog id where
// there is one. Fix the export or record it; do not add a row without a reason.
export const ALLOWED_UNIMPORTED = [];

// A repeated block that is not a defect, as [path, reason]. A row suppresses the pair whose first location is in that
// file.
export const ALLOWED_DUPLICATE = [
  ["packs/base/plugins/workflow/runtime/lib/delivery.mjs",
    "B40. The end of a checked subprocess, repeated in lib/gate.mjs: clear both timers, destroy the two streams, keep "
    + "what the partial buffers hold, and read the elapsed seconds. Every one of those lines reads or writes a local of "
    + "the caller, so a shared helper would take seven arguments to save seven lines. The fix that would earn its keep "
    + "is one shared subprocess supervisor, which is a larger change than this scanner should force."],
];

// ---------- reading the modules ----------

// One line of source with its 1-based number, comments and blank lines dropped, whitespace collapsed. Two blocks are
// "the same" when these lines match: the scanner is looking for copied code, and a reformat is still a copy. Reading
// names out of comment-free text also keeps a name in a comment from counting as a use.
export function meaningfulLines(text) {
  const out = [];
  const state = { block: false, modes: [] };
  text.split("\n").forEach((raw, i) => {
    const stripped = stripLine(raw, state).replace(/\s+/g, " ").trim();
    if (stripped) out.push({ line: i + 1, text: stripped });
  });
  return out;
}

// One line with its comments removed and its string contents kept, carrying the state that spans lines (a block
// comment and a stack of open template literals and their interpolations) in and out. It reads a character at a time rather than with a line regex
// because the regex version was wrong in the way that hides itself: indexOf("/*") fired on the tag glob inside
// ["tag", "--list", "skilliton-release/*"] and on a /* written inside a // comment, opened a block comment that never
// closed, and dropped the rest of the file without saying so. Six files here did that, one of them a runtime module
// whose last 355 lines were never read, and a test whose import of LEGACY_TEMPLATE_SHA12 was invisible as a result
// (2026-09-20). Quotes and template literals are tracked now, and readable() below proves the tracking reached the end.
// What may stand immediately before a regular expression: an operator, an opening bracket, or a keyword. After a
// value (an identifier, a number, a closing bracket) the same slash is division.
const STARTS_REGEX = /(?:^|[=(,:[!&|?{};+\-*%~^<>]|\b(?:return|typeof|instanceof|in|of|new|case|do|else|void|delete|yield|await))\s*$/;

function stripLine(raw, state) {
  let kept = "";
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    const two = raw.slice(i, i + 2);
    if (state.block) { if (two === "*/") { state.block = false; i++; } continue; }
    const top = state.modes[state.modes.length - 1];
    if (top === "t") {                       // inside the text of a template literal
      kept += c;
      if (c === "\\") { kept += raw[i + 1] ?? ""; i++; continue; }
      if (c === "`") { state.modes.pop(); continue; }
      if (two === "${") { kept += raw[i + 1]; state.modes.push("i"); i++; }
      continue;
    }
    if (c === '"' || c === "'") {
      kept += c;
      for (i++; i < raw.length; i++) {
        kept += raw[i];
        if (raw[i] === "\\") { kept += raw[i + 1] ?? ""; i++; continue; }
        if (raw[i] === c) break;
      }
      continue;
    }
    if (c === "`") { kept += c; state.modes.push("t"); continue; }
    // Braces are counted only inside an interpolation, which is the one place a } has to be recognised: it is
    // what returns the reader to template text. A nested template inside an interpolation inside a template is
    // not exotic here, the lane write guard builds its refusal that way, and a reader that only flipped a flag
    // on each backtick finished that file still inside a literal (2026-09-20).
    if (top === "i" || top === "b") {
      if (c === "{") state.modes.push("b");
      else if (c === "}") state.modes.pop();
    }
    if (two === "//") break;
    if (two === "/*") { state.block = true; i++; continue; }
    // A regular expression is read as one unit, because a backtick or a quote inside it is a character and not
    // the start of anything. Four files here hold one and were misread for it. A regex may not begin with a
    // quantifier, so the block-comment test above is safe to run first, and a slash after a value is division.
    if (c === "/" && STARTS_REGEX.test(kept)) {
      kept += c;
      let inClass = false;
      for (i++; i < raw.length; i++) {
        kept += raw[i];
        if (raw[i] === "\\") { kept += raw[i + 1] ?? ""; i++; continue; }
        if (raw[i] === "[") inClass = true;
        else if (raw[i] === "]") inClass = false;
        else if (raw[i] === "/" && !inClass) break;
      }
      continue;
    }
    kept += c;
  }
  return kept;
}

// Whether the line reader reached the last line with nothing still open. A block comment or a template literal open at
// the end of a file is not a file this scanner read, it is one it misread: either would be a syntax error, and Node
// parses every one of these files. The one shape that still fools the reader is a regular expression holding an
// unescaped /* or a quote, so this is the check that turns that from a silent truncation into a named file.
export function readable(text) {
  const state = { block: false, modes: [] };
  for (const raw of text.split("\n")) stripLine(raw, state);
  return !state.block && state.modes.length === 0;
}

// The code of a file as one string. A file the reader could not close is read raw instead, comments and all: a name in
// a comment then counts as a use, which can only make this scanner report less dead code than there is. Under-reporting
// is the safe direction; the file is named in the coverage line either way, so the reader knows which is which.
const codeOf = (text) => (readable(text)
  ? meaningfulLines(text).map((l) => l.text).join("\n")
  : text.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n"));

// The names a module exports, with the line each is declared on. A default export is not named and is skipped.
export function exportedNames(text) {
  const names = [];
  const add = (name, line) => { if (name && !names.some((n) => n.name === name)) names.push({ name, line }); };
  text.split("\n").forEach((raw, i) => {
    const line = i + 1;
    let m = /^export\s+(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/.exec(raw);
    if (m) { add(m[1], line); return; }
    m = /^export\s*\{([^}]*)\}/.exec(raw);
    if (!m) return;
    for (const part of m[1].split(",")) {
      const piece = part.trim();
      if (!piece) continue;
      const as = /\bas\s+([A-Za-z_$][\w$]*)$/.exec(piece);
      add(as ? as[1] : piece, line);
    }
  });
  return names;
}

const splitNames = (list) => list.split(",").map((p) => p.trim()).filter(Boolean)
  .map((p) => { const as = /^([A-Za-z_$][\w$]*)\s+as\s+/.exec(p); return as ? as[1] : p; })
  .filter((n) => /^[A-Za-z_$][\w$]*$/.test(n));

// The argument text of the import() that starts at `open`, up to its matching parenthesis.
function importArgument(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")") { depth--; if (depth === 0) return text.slice(open + 1, i); }
  }
  return null;
}

// Every way this file reaches another module. Each entry is one of:
//   {kind: "names", spec, names}     exactly these exports are used
//   {kind: "whole", spec, binding}   the module object is taken whole, under this name (null when it is not bound)
//   {kind: "unresolved", line}       a dynamic import whose module this scanner cannot name
export function moduleUses(text) {
  const out = [];
  const code = codeOf(text);
  let m;

  const named = /^import\s*(?:type\s+)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/gm;
  while ((m = named.exec(code))) out.push({ kind: "names", spec: m[2], names: splitNames(m[1]) });

  const reexport = /^export\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/gm;
  while ((m = reexport.exec(code))) out.push({ kind: "names", spec: m[2], names: splitNames(m[1]) });

  const namespace = /^import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s*["']([^"']+)["']/gm;
  while ((m = namespace.exec(code))) out.push({ kind: "whole", spec: m[2], binding: m[1] });

  const star = /^export\s*\*\s*from\s*["']([^"']+)["']/gm;
  while ((m = star.exec(code))) out.push({ kind: "whole", spec: m[1], binding: null });

  const defaultImport = /^import\s+[A-Za-z_$][\w$]*\s*,\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/gm;
  while ((m = defaultImport.exec(code))) out.push({ kind: "names", spec: m[2], names: splitNames(m[1]) });

  // One hop of constant folding, because a module is often named on an earlier line and not in the import itself:
  //   const file = new URL("./security.mjs", import.meta.url);        ... await import(file.href)
  //   const MODULE = join(PLUGINS, "runtime", "lib", "migrations.mjs"); ... await import(pathToFileURL(MODULE).href)
  const urls = new Map();
  const bind = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:new URL\()?[^;\n]*?["']([^"']+\.m?js)["']/g;
  while ((m = bind.exec(code))) urls.set(m[1], m[2]);

  // An expression position only. `commands/import.mjs` prints the line "Any hit refuses the import (exit 2)", and a
  // scanner that read that as a module load would report an unknown it had invented.
  const dynamic = /(?:^|[=({[,;:]|\bawait|\breturn)\s*import\s*\(/gm;
  while ((m = dynamic.exec(code))) {
    const open = m.index + m[0].length - 1;
    const arg = importArgument(code, open);
    if (arg === null) continue;
    const before = code.slice(Math.max(0, code.lastIndexOf("\n", m.index) + 1), m.index);
    const after = code.slice(open + arg.length + 2, open + arg.length + 64);

    const literal = [...arg.matchAll(/["']([^"']+\.m?js)["']/g)].map((x) => x[1]).pop();
    const folded = [...arg.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)].map((x) => urls.get(x[1])).filter(Boolean).pop();
    const spec = literal || folded || null;
    const line = code.slice(0, m.index).split("\n").length;
    if (!spec) { out.push({ kind: "unresolved", line }); continue; }

    const destructured = /\{([^}]*)\}\s*=\s*(?:await\s+)?$/.exec(before);
    if (destructured) { out.push({ kind: "names", spec, names: splitNames(destructured[1]) }); continue; }
    const property = /^\s*\)?\s*\.([A-Za-z_$][\w$]*)/.exec(after);
    if (property) { out.push({ kind: "names", spec, names: [property[1]] }); continue; }
    const bound = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?$/.exec(before);
    out.push({ kind: "whole", spec, binding: bound ? bound[1] : null });
  }

  for (const loader of NAMED_LOADERS) {
    const re = new RegExp(loader.call.source, "g");
    while ((m = re.exec(code))) out.push({ kind: "names", spec: `${loader.dir}/${m[1]}`, names: [m[2]] });
  }
  return out;
}

// Which names a file takes off a module it holds whole, and whether it uses that module in a way this scanner cannot
// follow (passing it on, spreading it, indexing it with a computed key). The declaration itself is the one bare
// mention that is expected.
export function propertyReads(text, binding) {
  const code = codeOf(text);
  const names = [...code.matchAll(new RegExp(`\\b${binding}\\.([A-Za-z_$][\\w$]*)`, "g"))].map((m) => m[1]);
  const bare = [...code.matchAll(new RegExp(`\\b${binding}\\b(?!\\s*\\.)`, "g"))].length;
  return { names, followable: bare <= 1 };
}

// A specifier resolved to a repository path. A relative one resolves against the importing file; anything else is
// matched by trailing path segments against the modules in the set, which is how a loader that built its path out of
// segments (join(ROOT, "packs", ..., "lib", "tasks.mjs")) still names its module.
export function resolveSpecifier(fromPath, specifier, known) {
  if (specifier.startsWith(".")) {
    const abs = resolve(join(REPO, dirname(fromPath)), specifier);
    if (!abs.startsWith(REPO + "/")) return [];
    const path = abs.slice(REPO.length + 1);
    return known.has(path) ? [path] : [];
  }
  if (specifier.startsWith("node:") || !/\.m?js$/.test(specifier)) return [];
  if (known.has(specifier)) return [specifier];
  const tail = specifier.split("/").filter(Boolean);
  const matches = [...known].filter((p) => {
    const parts = p.split("/");
    return parts.length >= tail.length && tail.every((seg, i) => parts[parts.length - tail.length + i] === seg);
  });
  return matches.length ? matches : [...known].filter((p) => basename(p) === basename(specifier));
}

// ---------- scanner 1: exports with no importer ----------

export function findUnimportedExports(files) {
  const known = new Set(files.map((f) => f.path));
  const used = new Map();   // path -> Set of names something takes from it
  const opaque = new Set(); // path -> held whole somewhere in a way this scanner cannot follow
  const misread = files.filter((f) => !readable(f.text)).map((f) => f.path).sort();
  let unresolved = 0;
  const take = (path, name) => { if (!used.has(path)) used.set(path, new Set()); used.get(path).add(name); };

  for (const file of files) {
    for (const use of moduleUses(file.text)) {
      if (use.kind === "unresolved") { unresolved++; continue; }
      for (const target of resolveSpecifier(file.path, use.spec, known)) {
        if (target === file.path) continue;
        if (use.kind === "names") { for (const name of use.names) take(target, name); continue; }
        if (!use.binding) { opaque.add(target); continue; }
        const read = propertyReads(file.text, use.binding);
        if (!read.followable) { opaque.add(target); continue; }
        for (const name of read.names) take(target, name);
      }
    }
  }

  const findings = [];
  for (const file of files) {
    if (!RUNTIME_RE.test(file.path)) continue;
    if (opaque.has(file.path)) continue;
    if (misread.includes(file.path)) continue; // its own exports were read from text this scanner could not close
    const contract = LOADER_CONTRACTS.find((c) => c.match.test(file.path));
    const taken = used.get(file.path) || new Set();
    for (const { name, line } of exportedNames(file.text)) {
      if (taken.has(name)) continue;
      if (contract && contract.names.includes(name)) continue;
      if (ALLOWED_UNIMPORTED.some(([p, n]) => p === file.path && n === name)) continue;
      findings.push({
        kind: "unimported-export",
        path: file.path,
        line,
        text: `${name} is exported and nothing in the repository reaches it. Either something was meant to use it, or the export is left over: make it local, or delete it.`,
      });
    }
  }
  return { findings, unresolved, opaque: [...opaque].sort(), misread };
}

// ---------- scanner 2: blocks that repeat ----------

export function findDuplicateBlocks(files, minLines = DUPLICATE_LINES) {
  const windows = new Map(); // the block's text -> where it appears
  for (const file of files) {
    if (!RUNTIME_RE.test(file.path)) continue;
    if (!readable(file.text)) continue; // a misread file's lines are not its lines, so a repeat among them means nothing
    const lines = meaningfulLines(file.text);
    for (let i = 0; i + minLines <= lines.length; i++) {
      const slice = lines.slice(i, i + minLines);
      const key = slice.map((l) => l.text).join("\n");
      if (!windows.has(key)) windows.set(key, []);
      windows.get(key).push({ path: file.path, index: i, line: slice[0].line });
    }
  }
  // One finding per repeated block, longest first, and a window inside a longer repeat already reported is dropped so
  // a copied function is one line of output and not one line per window into it.
  const findings = [];
  const claimed = new Set();
  for (const [key, spots] of [...windows.entries()].sort((a, b) => b[0].length - a[0].length)) {
    if (spots.length < 2) continue;
    const mark = (s) => `${s.path}:${s.index}`;
    if (spots.some((s) => claimed.has(mark(s)))) continue;
    for (const s of spots) for (let k = -minLines; k <= minLines; k++) claimed.add(`${s.path}:${s.index + k}`);
    if (ALLOWED_DUPLICATE.some(([p]) => p === spots[0].path)) continue;
    const elsewhere = spots.slice(1).map((s) => `${s.path}:${s.line}`).join(", ");
    findings.push({
      kind: "duplicate-block",
      path: spots[0].path,
      line: spots[0].line,
      text: `${key.split("\n").length} meaningful lines repeat at ${elsewhere}. Share them, or say in a comment why the copy stays.`,
    });
  }
  return findings;
}

// ---------- running it ----------

export function listFiles() {
  const git = (args) => {
    const r = spawnSync("git", ["-C", REPO, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr.trim() || r.error?.message}`);
    return r.stdout.split("\0").filter(Boolean);
  };
  const paths = [...new Set([...git(["ls-files", "-z"]), ...git(["ls-files", "-z", "--others", "--exclude-standard"])])].sort();
  const files = [];
  for (const path of paths) {
    if (!path.endsWith(".mjs") && !path.endsWith(".js")) continue;
    let st;
    try { st = statSync(join(REPO, path)); } catch { continue; }
    if (!st.isFile() || st.size > 8 * 1024 * 1024) continue;
    files.push({ path, text: readFileSync(join(REPO, path), "utf8") });
  }
  return files;
}

const RT = "packs/base/plugins/workflow/runtime/";

function selfTest() {
  const lib = (name, text) => ({ path: `${RT}lib/${name}.mjs`, text });
  const cmd = (name, text) => ({ path: `${RT}commands/${name}.mjs`, text });
  const cases = [
    {
      name: "an export nothing reaches is found",
      files: [lib("a", "export const USED = 1;\nexport const LEFT = 2;\n"), cmd("b", 'import { USED } from "../lib/a.mjs";\nUSED;\n')],
      expect: 1,
    },
    {
      name: "every export imported somewhere passes",
      files: [lib("a", "export const USED = 1;\n"), cmd("b", 'import { USED } from "../lib/a.mjs";\nUSED;\n')],
      expect: 0,
    },
    {
      name: "a re-export alias nothing imports is found, which is the finding that named this batch",
      files: [lib("config", "export const KNOWN_SECTIONS = [];\n"),
              lib("doctor", 'import { KNOWN_SECTIONS } from "./config.mjs";\nconst KNOWN_CONFIG_SECTIONS = KNOWN_SECTIONS;\nexport { KNOWN_CONFIG_SECTIONS };\n'),
              cmd("doctor", 'import { KNOWN_SECTIONS } from "../lib/config.mjs";\nKNOWN_SECTIONS;\n')],
      expect: 1,
    },
    {
      // Every case below is a shape that made the line reader lose the rest of a file on 2026-09-20. The reader read
      // lines with a regex, so a /* inside a string opened a block comment that never closed, and everything after it
      // vanished with no count and no message: six files here, one of them a runtime module missing its last 355
      // lines, and a test whose import was invisible, so the export it used was narrowed and the test broke.
      name: "a slash-star inside a string does not open a comment, so a later import still counts",
      files: [lib("a", "export const KEPT = 1;\n"),
              cmd("b", 'const tags = ["tag", "--list", "skilliton-release/*"];\nimport { KEPT } from "../lib/a.mjs";\nKEPT; tags;\n')],
      expect: 0,
    },
    {
      name: "a slash-star written inside a line comment does not open a comment either",
      files: [lib("a", "export const KEPT = 1;\n"),
              cmd("b", '//   command-shape   a runtime/commands/*.mjs that exports help and run\nimport { KEPT } from "../lib/a.mjs";\nKEPT;\n')],
      expect: 0,
    },
    {
      // The subject holds the hard literal, because that is where the cost is: a module the reader cannot close is
      // skipped, so its dead export goes unreported and the scanner passes a tree it never read. Written as an
      // importer instead, the case passes either way on the raw fallback and proves nothing.
      name: "a backtick inside a regular expression is a character, so the module holding it is still judged",
      files: [lib("a", 'const md = (x) => x.replace(/[\\\\|`*_{}]/g, "");\nexport const LEFT = md;\n')],
      expect: 1,
    },
    {
      // Inside an interpolation the reader is back in code, so a quoted backtick there is a character. A reader that
      // only flips a flag on every backtick loses the rest of the file instead; that is how the guardrails lane write
      // guard, which builds its refusal from a template inside an interpolation, was the last file read raw.
      name: "a quoted backtick inside an interpolation is a character, so the module holding it is still judged",
      files: [lib("a", "const out = `${JSON.stringify({\n  why: \"a ` here\",\n})}`;\nexport const LEFT = out;\n")],
      expect: 1,
    },
    {
      name: "a destructured dynamic import below such a line names its exports, which is the export the suite caught",
      files: [lib("legacy-template", 'export const LEGACY_TEMPLATE_SHA12 = "a340107f1258";\n'),
              cmd("b", 'const tags = ["tag", "--list", "skilliton-release/*"];\n' +
                        'const { LEGACY_TEMPLATE_SHA12 } = await import("../lib/legacy-template.mjs");\nLEGACY_TEMPLATE_SHA12; tags;\n')],
      expect: 0,
    },
    {
      name: "a file the reader cannot close is not judged, because its lines are not its lines",
      files: [lib("a", "export const NEVER_JUDGED = 1;\n/* this comment never closes\n")],
      expect: 0,
    },
    {
      name: "a name in a comment is not a use",
      files: [lib("a", "export const LEFT = 2;\n"), cmd("b", '// LEFT is described here but never imported\nimport "../lib/a.mjs";\n')],
      expect: 1,
    },
    {
      name: "a renamed import counts as using the exported name",
      files: [lib("a", "export function build() {}\n"), cmd("b", 'import { build as mk } from "../lib/a.mjs";\nmk();\n')],
      expect: 0,
    },
    {
      name: "a re-export from another module counts as a use",
      files: [lib("a", "export const ONE = 1;\n"), lib("b", 'export { ONE } from "./a.mjs";\n'),
              cmd("c", 'import { ONE } from "../lib/b.mjs";\nONE;\n')],
      expect: 0,
    },
    {
      name: "a module held whole and read by property is followed name by name",
      files: [lib("a", "export const ONE = 1;\nexport const TWO = 2;\n"),
              cmd("b", 'import * as a from "../lib/a.mjs";\na.ONE;\n')],
      expect: 1,
    },
    {
      name: "a module held whole and passed on is not guessed at",
      files: [lib("a", "export const ONE = 1;\nexport const TWO = 2;\n"),
              cmd("b", 'import * as a from "../lib/a.mjs";\nregister(a);\n')],
      expect: 0,
    },
    {
      name: "a command's help and run are the router's contract, not dead code",
      files: [cmd("gate", "export const help = 'x';\nexport async function run() {}\n")],
      expect: 0,
    },
    {
      name: "a command's other exports are still subjects",
      files: [cmd("gate", "export const help = 'x';\nexport async function run() {}\nexport const SPARE = 1;\n")],
      expect: 1,
    },
    {
      name: "a dynamic import destructured on the spot names its exports",
      files: [lib("tasks", "export const ONE = 1;\n"),
              { path: "scripts/x.test.mjs", text: 'const { ONE } = await import(pathToFileURL(join(LIB, "tasks.mjs")).href);\nONE;\n' }],
      expect: 0,
    },
    {
      name: "a dynamic import bound to a name is followed by its property reads",
      files: [lib("tasks", "export const ONE = 1;\nexport const TWO = 2;\n"),
              { path: "scripts/x.test.mjs", text: 'const t = await import(pathToFileURL(join(LIB, "tasks.mjs")).href);\nt.ONE;\n' }],
      expect: 1,
    },
    {
      name: "a path built one segment at a time still names its module",
      files: [lib("stack", "export const ONE = 1;\n"),
              { path: "scripts/x.test.mjs", text: 'const { ONE } = await import(join(REPO, "packs", "base", "plugins", "workflow", "runtime", "lib", "stack.mjs"));\nONE;\n' }],
      expect: 0,
    },
    {
      name: "a module named on the line above the import is folded through",
      files: [lib("security", "export function securitySummary() {}\n"),
              lib("prepare", 'const file = new URL("./security.mjs", import.meta.url);\nconst mod = await import(file.href);\nmod.securitySummary;\n'),
              cmd("p", 'import "../lib/prepare.mjs";\n')],
      expect: 0,
    },
    {
      name: "a named loader's two arguments name the module and the export",
      files: [lib("fork", "export async function forkSummary() {}\n"),
              lib("lifecycle", 'const r = await loadOptional("fork.mjs", "forkSummary");\nr;\n'),
              cmd("s", 'import "../lib/lifecycle.mjs";\n')],
      expect: 0,
    },
    {
      name: "a dynamic import this scanner cannot name is counted, not passed over",
      files: [lib("a", "export const ONE = 1;\n"), cmd("b", "const mod = await import(whatever.href);\nmod;\n")],
      expectUnresolved: 1,
    },
    {
      name: "a script outside the runtime is read as an importer, not as a subject",
      files: [{ path: "scripts/x.test.mjs", text: "export const HELPER = 1;\n" }],
      expect: 0,
    },
    {
      name: "an export only a test imports passes",
      files: [lib("a", "export const ONE = 1;\n"),
              { path: "scripts/x.test.mjs", text: 'import { ONE } from "../packs/base/plugins/workflow/runtime/lib/a.mjs";\nONE;\n' }],
      expect: 0,
    },
  ];
  const body = (n, tag) => Array.from({ length: n }, (_, i) => `const ${tag}${i} = ${i} + 1;`).join("\n");
  const dupCases = [
    {
      name: "the same block in two runtime files is found",
      files: [lib("a", `${body(DUPLICATE_LINES, "x")}\n`), lib("b", `${body(DUPLICATE_LINES, "x")}\n`)],
      expect: 1,
    },
    {
      name: "one line short of the bar passes",
      files: [lib("a", `${body(DUPLICATE_LINES - 1, "x")}\n`), lib("b", `${body(DUPLICATE_LINES - 1, "x")}\n`)],
      expect: 0,
    },
    {
      name: "a copy that was reindented and recommented is still a copy",
      files: [lib("a", `${body(DUPLICATE_LINES, "x")}\n`),
              lib("b", body(DUPLICATE_LINES, "x").split("\n").map((l, i) => `   ${l} // note ${i}`).join("\n\n") + "\n")],
      expect: 1,
    },
    {
      name: "a long repeat is reported once, not once per window",
      files: [lib("a", `${body(DUPLICATE_LINES * 2, "x")}\n`), lib("b", `${body(DUPLICATE_LINES * 2, "x")}\n`)],
      expect: 1,
    },
    {
      name: "a block repeated three times names every other place",
      files: [lib("a", `${body(DUPLICATE_LINES, "x")}\n`), lib("b", `${body(DUPLICATE_LINES, "x")}\n`), lib("c", `${body(DUPLICATE_LINES, "x")}\n`)],
      expect: 1,
    },
    {
      name: "a copy in a script is not a subject",
      files: [{ path: "scripts/a.mjs", text: `${body(DUPLICATE_LINES, "x")}\n` }, { path: "scripts/b.mjs", text: `${body(DUPLICATE_LINES, "x")}\n` }],
      expect: 0,
    },
  ];
  let failed = 0;
  const report = (ok, name, got, want, unit) => {
    console.log(`${ok ? "ok  " : "FAIL"} ${name} (${unit} ${got}, expected ${want})`);
    if (!ok) failed++;
  };
  for (const c of cases) {
    const r = findUnimportedExports(c.files);
    if (c.expectUnresolved !== undefined) report(r.unresolved === c.expectUnresolved, c.name, r.unresolved, c.expectUnresolved, "unresolved");
    else report(r.findings.length === c.expect, c.name, r.findings.length, c.expect, "findings");
  }
  for (const c of dupCases) {
    const got = findDuplicateBlocks(c.files).length;
    report(got === c.expect, c.name, got, c.expect, "findings");
  }
  console.log(failed
    ? `\nself-test FAILED: ${failed} case(s)`
    : `\nself-test passed: both scanners find known-bad input and pass known-good input (${cases.length + dupCases.length} cases)`);
  return failed ? 1 : 0;
}

function main() {
  if (process.argv.includes("--self-test")) return selfTest();
  let files;
  try { files = listFiles(); } catch (e) { console.log(`deadcode NOT RUN: ${e.message}`); return 2; }
  const { findings: unimported, unresolved, opaque, misread } = findUnimportedExports(files);
  const findings = [...unimported, ...findDuplicateBlocks(files)];
  for (const f of findings) console.log(`FAIL ${f.path}:${f.line}: [${f.kind}] ${f.text}`);

  const subjects = files.filter((f) => RUNTIME_RE.test(f.path));
  const exports = subjects.reduce((n, f) => n + exportedNames(f.text).length, 0);
  // What was not read is printed either way. A scanner that only spoke up about what it found would be reporting
  // silence as coverage.
  const runtimeOpaque = opaque.filter((p) => RUNTIME_RE.test(p));
  console.log("");
  if (misread.length) console.log(`read raw, comments and all, because the reader could not close them: ${misread.join(", ")}`);
  console.log(`read: ${exports} export(s) across ${subjects.length} runtime module(s); ${unresolved} dynamic import(s) whose module could not be named; ${runtimeOpaque.length} module(s) held whole and not followed${runtimeOpaque.length ? `: ${runtimeOpaque.join(", ")}` : ""}`);
  console.log(`allow list: ${ALLOWED_UNIMPORTED.length} export(s), ${ALLOWED_DUPLICATE.length} block(s)`);
  console.log(findings.length
    ? `deadcode FAILED: ${findings.length} finding(s). Fix each one, or record it in docs/BACKLOG.md with a reason and add its row to the allow list in scripts/deadcode.mjs naming that backlog id.`
    : `deadcode passed: every export is reached, and no block of ${DUPLICATE_LINES} meaningful lines repeats`);
  return findings.length ? 1 : 0;
}

// Only when it is the program. The scanners above are exported so another script can reuse them, and a module that
// scanned the whole repository just for being imported would make that impossible.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main();
