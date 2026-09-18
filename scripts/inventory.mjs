// inventory.mjs: what the Skilliton plugins start and where they reach outside a repository, read from the code, and
// what docs/IT-ALLOWLIST.md says about it. Used by scripts/allowlist.test.mjs (the allow list matches the code, B26)
// and scripts/footprint.test.mjs (the small-footprint rules, B28). Node built-ins only.
//
// Scope: every file under packs/base/plugins/ that holds code, the eval fixtures included, plus scripts/skilliton.mjs,
// scripts/setup.mjs and scripts/scrub-check.sh (the runtime runs a skills repository's copy of that one in import and
// propose). Documentation, manifests and data files outside the folders that hold code are returned separately, so a
// caller can say how many files are read as code and how many are not.
//
// Shell scripts are read with a small reader of the shell language, not by running them: it follows quoting, command
// substitution, here-documents, case patterns, function definitions and the commands that run another command (exec,
// command, env, xargs, nohup, time, timeout, nice, sudo). A command word that is an expansion ("$parser") cannot be read
// as a program name and is returned as dynamic, with its line, so a caller has to say what it runs. Commands inside a
// quoted string handed to eval, or to bash -c or sh -c through a variable, are reported as problems rather than guessed.
// Literal strings given to trap, bash -c and sh -c are read as scripts.
//
// JavaScript is read by finding each call of a node:child_process function (by the local names its import gives them)
// and of the wrapper functions a caller names, and reading the first argument: a string literal is a program name;
// anything else is returned as dynamic. Any other use of child_process in a file is a problem.

import { lstatSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
export const PLUGINS = "packs/base/plugins";
export const ALLOWLIST_DOC = "docs/IT-ALLOWLIST.md";

const toPosix = (p) => p.split(sep).join("/");

// Walks a folder without following links: a link inside the plugins points at something this reader cannot vouch for,
// so it is returned as a file and classified like any other, rather than being read through.
// Only regular files are listed to be read. A link to a device or to a pipe is a file to readdir and to lstat, and
// reading one never returns: /dev/zero has no end, and a pipe with no writer blocks for ever. git stores such a link
// verbatim, so it can arrive in a checkout. Anything that is not a regular file is reported instead of read, and a
// link this reader cannot follow at all (it points nowhere, or in a circle) is still listed, because the reader that
// opens it says so in one line rather than stopping.
const kindOf = (st) => (st.isDirectory() ? "a folder" : st.isFIFO() ? "a pipe" : st.isSocket() ? "a socket" : st.isBlockDevice() || st.isCharacterDevice() ? "a device" : "not a plain file");

function walk(dir, out = [], notRegular = []) {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    let st;
    try { st = lstatSync(path); } catch (e) { notRegular.push({ path, why: `it could not be looked at (${e.code ?? e.message})` }); continue; }
    if (st.isFile()) { out.push(path); continue; }
    if (st.isDirectory()) { walk(path, out, notRegular); continue; }
    if (st.isSymbolicLink()) {
      let target = null;
      try { target = statSync(path); } catch { out.push(path); continue; } // points nowhere, or in a circle: read and reported
      if (target.isFile()) { out.push(path); continue; }
      notRegular.push({ path, why: `it is a link to ${kindOf(target)}, and reading one can never finish` });
      continue;
    }
    notRegular.push({ path, why: `it is ${kindOf(st)}, and reading one can never finish` });
  }
  return out;
}

// Files that hold no code to read: documentation, manifests and data. The extension is trusted only outside the
// folders that hold code, because a file a hook reads is code however it is named (a hook can source hooks/note.md).
const DATA_FILE = /\.(md|json|jsonl|ya?ml|toml|txt|lock|png|jpg|jpeg|gif|svg|ico|pdf|zip|tar|gz)$/i;
const CODE_FOLDER = /\/(hooks|bin|runtime|scripts)\//;
// The manifests a client reads, which are data wherever they sit.
const MANIFEST = /\/(hooks|plugin|marketplace|settings|package)\.json$/;

// Files in scope, as repository-relative paths with forward slashes: { js, shell, data, other }. The first line
// decides before the name does, so a shell script named .mjs is read as a shell script. `data` is what holds no code
// to read (documentation, the clients' manifests, fixtures' data), and `other` is whatever is left, which callers
// treat as a problem. The eval fixtures are read like any other script; they ship with the plugin.
export function scopeFiles(root = REPO) {
  const notRegular = [];
  const plugin = walk(join(root, PLUGINS), [], notRegular).map((p) => toPosix(relative(root, p)));
  const js = ["scripts/skilliton.mjs", "scripts/setup.mjs"];
  const shell = ["scripts/scrub-check.sh"];
  const data = [];
  const other = [];
  for (const p of plugin) {
    const first = firstLine(join(root, p));
    if (/^#!.*\b(ba|k|z|da)?sh\b/.test(first)) { shell.push(p); continue; }
    if (/^#!.*\bnode\b/.test(first)) { js.push(p); continue; }
    if (/\.(mjs|cjs|js)$/.test(p)) { js.push(p); continue; }
    if (/\.(sh|bash|ksh|zsh)$/.test(p)) { shell.push(p); continue; }
    if (MANIFEST.test(p) || (DATA_FILE.test(p) && !CODE_FOLDER.test(p))) { data.push(p); continue; }
    other.push(p);
  }
  return { js: js.sort(), shell: shell.sort(), data: data.sort(), other: other.sort(), notRegular: notRegular.map((n) => ({ path: toPosix(relative(root, n.path)), why: n.why })) };
}

function firstLine(path) {
  try { return readFileSync(path, "utf8").split("\n", 1)[0]; } catch { return ""; }
}

// ---------- shell ----------

const KEYWORDS = new Set(["if", "then", "else", "elif", "fi", "case", "esac", "for", "select", "while", "until", "do", "done", "in", "function", "time", "{", "}", "!", "[[", "]]", "coproc"]);
export const SHELL_BUILTINS = new Set([
  ":", ".", "[", "alias", "bg", "bind", "break", "builtin", "caller", "cd", "command", "compgen", "complete", "compopt", "continue",
  "declare", "dirs", "disown", "echo", "enable", "eval", "exec", "exit", "export", "false", "fc", "fg", "getopts", "hash", "help",
  "history", "jobs", "kill", "let", "local", "logout", "mapfile", "popd", "printf", "pushd", "pwd", "read", "readarray", "readonly",
  "return", "set", "shift", "shopt", "source", "suspend", "test", "times", "trap", "true", "type", "typeset", "ulimit", "umask",
  "unalias", "unset", "wait",
]);
// Commands whose arguments name another command to run. The value lists the options that take a separate argument.
const RUNS_NEXT = {
  exec: ["-a"], command: [], builtin: [], nohup: [], time: [], nice: ["-n"], env: ["-u", "-C"], xargs: ["-n", "-I", "-L", "-P", "-d", "-s", "-E", "-a"],
  timeout: ["-s", "-k"], sudo: ["-u", "-g", "-C", "-D", "-h", "-p", "-U"], doas: ["-u", "-C"], stdbuf: ["-i", "-o", "-e"],
};

// Returns { commands: [{ word, line, args }], dynamic: [{ text, line, args }], functions: [names], sourced: [{ path,
// line }], problems: [{ text, line }] }. `sourced` names the files a script reads with . or source, whose contents run
// as if they were part of it.
// `word` is the command word as written (a path stays a path) and `args` its arguments, each the argument's text
// without quotes or null when it holds an expansion. Builtins, keywords and the script's own functions are included in
// commands, and callers filter them with SHELL_BUILTINS and `functions`.
export function shellCommands(text) {
  const result = { commands: [], dynamic: [], functions: new Set(), sourced: [], problems: [] };
  const lineStarts = [0];
  for (let k = 0; k < text.length; k++) if (text[k] === "\n") lineStarts.push(k + 1);
  const lineAt = (index) => {
    let lo = 0, hi = lineStarts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lineStarts[mid] <= index) lo = mid; else hi = mid - 1; }
    return lo + 1;
  };
  parseScript(text, 0, null, result, lineAt, 0);
  return { ...result, functions: [...result.functions].sort() };
}

// Parses commands from src[start] until the end, or until an unmatched ")" when stop is ")". Returns the index after
// the stop character (or src.length). `offset` maps indexes in src to indexes in the original text (for backticks and
// literal scripts read from strings).
function parseScript(src, start, stop, result, lineAt, offset) {
  const n = src.length;
  let i = start;
  let expectCommand = true;
  let depth = 0; // subshells opened with "(" inside this script
  let doubleBracket = false;
  let forHeader = false;
  let redirectTarget = false;
  let heredocDelimiter = null; // { strip } while the next word is a here-document delimiter
  const heredocs = [];
  const cases = []; // each: "word" | "in" | "pattern" | "body"
  let runsNext = null; // { name, afterDashV, skipNext, needDuration } while reading the arguments of exec, env, ...
  let pendingScriptArg = null; // "trap" | "-c" while the next word is a script given as a string
  let commandName = null;
  let functionNameNext = false;
  let arrayLiteral = false; // inside NAME=( ... ), whose words are values

  const line = (index) => lineAt(index + offset);
  let current = null; // the command being read, so its arguments are collected
  let sourcing = null; // the . or source command being read, whose argument names a file that runs as part of this one
  const record = (word, index) => {
    current = { word, line: line(index), args: [], background: false };
    result.commands.push(current);
    commandName = word;
    const base = word.split("/").pop();
    if (Object.hasOwn(RUNS_NEXT, base)) runsNext = { name: base, skipNext: false, needDuration: base === "timeout" };
    else runsNext = null;
    pendingScriptArg = base === "trap" ? "trap" : null;
    if (base === "eval") result.problems.push({ text: "eval runs text this reader cannot see", line: line(index) });
    if (base === "." || base === "source") sourcing = current;
  };

  const endCommand = () => { expectCommand = true; runsNext = null; pendingScriptArg = null; commandName = null; current = null; sourcing = null; };
  const argument = (w) => {
    if (!current) return;
    current.args.push(w.literal);
    if (sourcing === current && current.args.length === 1) {
      result.sourced.push({ path: w.literal, line: current.line });
      sourcing = null;
    }
  };

  while (i < n) {
    const c = src[i];
    if (c === " " || c === "\t") { i++; continue; }
    if (c === "\\" && src[i + 1] === "\n") { i += 2; continue; }
    if (c === "#") { while (i < n && src[i] !== "\n") i++; continue; }
    if (c === "\n") {
      i++;
      for (const h of heredocs.splice(0)) i = readHeredoc(src, i, h, result, lineAt, offset);
      if (!doubleBracket) { if (forHeader) forHeader = false; if (cases.at(-1) === "word" || cases.at(-1) === "in") { /* case header may span lines */ } else endCommand(); }
      continue;
    }
    if (arrayLiteral && c === ")") { arrayLiteral = false; i++; continue; }
    if (stop === ")" && c === ")" && depth === 0 && cases.at(-1) !== "pattern" && !doubleBracket) return i + 1;

    // Operators.
    if (!doubleBracket && (c === ";" || c === "&" || c === "|")) {
      const two = src.slice(i, i + 3);
      if (c === ";" && src[i + 1] === ";") { i += two === ";;&" ? 3 : 2; if (cases.length) cases[cases.length - 1] = "pattern"; expectCommand = false; runsNext = null; continue; }
      if (c === ";" && src[i + 1] === "&") { i += 2; if (cases.length) cases[cases.length - 1] = "pattern"; expectCommand = false; runsNext = null; continue; }
      if (c === "&" && src[i + 1] === ">") { i += src[i + 2] === ">" ? 3 : 2; redirectTarget = true; continue; }
      if (cases.at(-1) === "pattern" && c === "|") { i++; continue; }
      if (c === "&" && src[i + 1] !== "&" && current) current.background = true; // left running after the script goes on
      i += (src[i + 1] === c || (c === "|" && src[i + 1] === "&")) ? 2 : 1;
      if (forHeader && c === ";") forHeader = false;
      endCommand();
      continue;
    }
    if (c === "(" && !doubleBracket) {
      if (src[i + 1] === "(" && expectCommand) { i = skipBalanced(src, i, "(", ")"); endCommand(); expectCommand = false; continue; } // (( arithmetic ))
      if (cases.at(-1) === "pattern") { i++; continue; }
      depth++; i++; endCommand(); continue;
    }
    if (c === ")" && !doubleBracket) {
      i++;
      if (cases.at(-1) === "pattern") { cases[cases.length - 1] = "body"; endCommand(); continue; }
      if (depth > 0) depth--;
      expectCommand = false; runsNext = null;
      continue;
    }
    if ((c === "<" || c === ">") && src[i + 1] === "(" ) { // process substitution
      i = parseScript(src, i + 2, ")", result, lineAt, offset);
      if (expectCommand) { result.dynamic.push({ text: "process substitution", line: line(i) }); expectCommand = false; }
      // As an argument it is a file name this reader cannot produce: `bash <(cat payload)` hands bash a program, and
      // `. <(cat payload)` runs one as part of the script. It is recorded as an unreadable argument, and as an
      // unreadable source when it is what . or source was given, rather than dropped.
      else if (current) {
        current.args.push(null);
        if (sourcing === current && current.args.length === 1) { result.sourced.push({ path: null, line: current.line }); sourcing = null; }
      }
      continue;
    }
    if ((c === "<" || c === ">") && !doubleBracket) {
      if (c === "<" && src[i + 1] === "<" && src[i + 2] !== "<") {
        i += 2;
        const strip = src[i] === "-";
        if (strip) i++;
        heredocDelimiter = { strip };
        continue;
      }
      i += src.slice(i, i + 3) === "<<<" ? 3 : 1;
      while (src[i] === ">" || src[i] === "&" || src[i] === "|") i++;
      redirectTarget = true;
      continue;
    }

    // A word.
    const w = readWord(src, i, result, lineAt, offset, doubleBracket);
    const at = i;
    i = w.end;
    if (!w.raw) { i++; continue; }

    if (heredocDelimiter) { heredocs.push({ delimiter: w.literal ?? w.raw.replace(/["'\\]/g, ""), quoted: /["'\\]/.test(w.raw), strip: heredocDelimiter.strip, command: current }); heredocDelimiter = null; continue; }
    if (redirectTarget) { redirectTarget = false; continue; }
    if (/^\d+$/.test(w.raw) && (src[i] === "<" || src[i] === ">")) continue; // a file descriptor number

    if (arrayLiteral) continue;
    if (doubleBracket) { if (w.raw === "]]") { doubleBracket = false; expectCommand = false; } continue; }
    if (forHeader) continue;

    const state = cases.at(-1);
    if (state === "word") { cases[cases.length - 1] = "in"; continue; }
    if (state === "in") { if (w.raw === "in") cases[cases.length - 1] = "pattern"; continue; }
    if (state === "pattern") { if (w.raw === "esac") { cases.pop(); expectCommand = false; } continue; }

    if (functionNameNext) { result.functions.add(w.raw); functionNameNext = false; expectCommand = true; continue; }

    if (pendingScriptArg && !expectCommand) {
      const kind = pendingScriptArg;
      pendingScriptArg = null;
      if (w.literal !== null) { if (w.literal !== "-") parseScript(w.literal, 0, null, result, (k) => lineAt(k + w.literalOffset), 0); }
      else result.problems.push({ text: `${kind === "trap" ? "a trap" : "a -c script"} given through an expansion (${w.raw}) cannot be read`, line: line(at) });
      continue;
    }

    // find -exec <command> ... is a command, and reads like an argument until it is asked for.
    if (commandName !== null && !expectCommand && commandName.split("/").pop() === "find" && ["-exec", "-execdir", "-ok", "-okdir"].includes(w.raw)) {
      argument(w);
      expectCommand = true;
      runsNext = null;
      continue;
    }
    if (runsNext && !expectCommand) {
      const r = runsNext;
      argument(w);
      if (r.name === "command" && /^-[vV]+$/.test(w.raw)) { runsNext = null; continue; } // a lookup, not a run
      if (r.skipNext) { r.skipNext = false; continue; }
      // env -S "node -e ..." runs a command written as one string. Splitting that string is env's own work, with its
      // own quoting and $-expansion, so this reader says it cannot follow it rather than guessing.
      if (r.name === "env" && (/^-[A-Za-z]*S$/.test(w.raw) || /^--split-string(=|$)/.test(w.raw))) { result.problems.push({ text: "env -S runs a command written as one string, which this reader cannot follow", line: line(at) }); runsNext = null; continue; }
      if (w.raw.startsWith("-") && w.raw !== "-") { if (RUNS_NEXT[r.name].includes(w.raw)) r.skipNext = true; continue; }
      if (r.name === "env" && /^[A-Za-z_][A-Za-z0-9_]*=/.test(w.raw)) continue;
      if (r.needDuration) { r.needDuration = false; continue; }
      runsNext = null;
      expectCommand = true; // this word is the command the wrapper runs
    }

    if (commandName !== null && !expectCommand) {
      const base = commandName.split("/").pop();
      // -c, and any group of flags ending in c (bash -lc "..."), hands the next word to the shell as a script.
      if (["bash", "sh", "dash", "ksh", "zsh"].includes(base) && /^-[A-Za-z]*c$/.test(w.raw)) pendingScriptArg = "-c";
      argument(w);
      continue;
    }
    if (!expectCommand) continue;

    // Command position.
    if (/^[A-Za-z_][A-Za-z0-9_]*(\[.*\])?\+?=/.test(w.raw)) { // an assignment before the command
      if (w.raw.endsWith("=") && src[i] === "(") { arrayLiteral = true; i++; }
      continue;
    }
    if (w.literal !== null && KEYWORDS.has(w.literal)) {
      const k = w.literal;
      if (k === "case") { cases.push("word"); expectCommand = false; }
      else if (k === "esac") { cases.pop(); expectCommand = false; }
      else if (k === "for" || k === "select") forHeader = true;
      else if (k === "[[") doubleBracket = true;
      else if (k === "function") functionNameNext = true;
      else if (k === "fi" || k === "done" || k === "}") expectCommand = false;
      continue;
    }
    // name() { ... } defines a function.
    const after = src.slice(i).match(/^[ \t]*\([ \t]*\)/);
    if (after && w.literal !== null) { result.functions.add(w.literal); i += after[0].length; expectCommand = true; continue; }

    if (w.literal === null) {
      current = { word: w.raw, line: line(at), args: [] };
      result.dynamic.push(current);
      current.text = w.raw;
      expectCommand = false; commandName = w.raw; runsNext = null;
      continue;
    }
    record(w.literal, at);
    expectCommand = false;
  }
  if (stop === ")") result.problems.push({ text: "a command substitution is not closed", line: line(n - 1) });
  return n;
}

// Skips from src[i] (an opening character) to after its matching closing character, following quotes.
function skipBalanced(src, i, open, close) {
  let level = 0;
  for (let k = i; k < src.length; k++) {
    const c = src[k];
    if (c === "\\") { k++; continue; }
    if (c === "'") { k = src.indexOf("'", k + 1); if (k < 0) return src.length; continue; }
    if (c === open) level++;
    else if (c === close) { level--; if (level === 0) return k + 1; }
  }
  return src.length;
}

// Reads one word from src[i]. Returns { raw, literal, literalOffset, end }: literal is the word's text with quotes
// removed when it holds no expansion, else null. Command substitutions inside it are parsed into result.
function readWord(src, i, result, lineAt, offset, doubleBracket) {
  const n = src.length;
  const start = i;
  let literal = "";
  let expanded = false;
  let literalOffset = null;
  const stopAt = doubleBracket ? /[ \t\n]/ : /[ \t\n;&|()<>]/;
  while (i < n && !stopAt.test(src[i])) {
    const c = src[i];
    if (doubleBracket && i - start === 2 && src.slice(start, i) === "]]" && /[;&|)<>]/.test(c)) break; // "]];" ends [[ ]]
    if (c === "\\") {
      if (src[i + 1] === "\n") { i += 2; continue; }
      literal += src[i + 1] ?? ""; i += 2; continue;
    }
    if (c === "'") {
      const close = src.indexOf("'", i + 1);
      const end = close < 0 ? n : close;
      if (literalOffset === null) literalOffset = i + 1 + offset;
      literal += src.slice(i + 1, end);
      i = end + 1;
      continue;
    }
    if (c === "$" && src[i + 1] === "'") {
      let k = i + 2;
      while (k < n && src[k] !== "'") k += src[k] === "\\" ? 2 : 1;
      literal += src.slice(i + 2, k).replace(/\\n/g, "\n").replace(/\\t/g, "\t");
      i = k + 1;
      continue;
    }
    if (c === '"') {
      i++;
      if (literalOffset === null) literalOffset = i + offset;
      while (i < n && src[i] !== '"') {
        if (src[i] === "\\") { literal += src[i + 1] ?? ""; i += 2; continue; }
        if (src[i] === "$" || src[i] === "`") {
          const e = readExpansion(src, i, result, lineAt, offset);
          if (e) { expanded = true; i = e; continue; }
        }
        literal += src[i]; i++;
      }
      i++;
      continue;
    }
    if (c === "$" || c === "`") {
      const e = readExpansion(src, i, result, lineAt, offset);
      if (e) { expanded = true; i = e; continue; }
    }
    literal += c; i++;
  }
  return { raw: src.slice(start, i), literal: expanded ? null : literal, literalOffset: literalOffset ?? start + offset, end: i };
}

// Reads a $... or `...` expansion at src[i]; returns the index after it, or null when "$" is a plain character.
function readExpansion(src, i, result, lineAt, offset) {
  const n = src.length;
  if (src[i] === "`") {
    let k = i + 1;
    while (k < n && src[k] !== "`") k += src[k] === "\\" ? 2 : 1;
    parseScript(src.slice(i + 1, k), 0, null, result, lineAt, offset + i + 1);
    return k + 1;
  }
  const next = src[i + 1];
  if (next === "(") {
    if (src[i + 2] === "(") return skipBalanced(src, i + 1, "(", ")"); // $(( arithmetic ))
    return parseScript(src, i + 2, ")", result, lineAt, offset);
  }
  if (next === "{") {
    let level = 0;
    for (let k = i + 1; k < n; k++) {
      const c = src[k];
      if (c === "\\") { k++; continue; }
      if (c === "'") { k = src.indexOf("'", k + 1); if (k < 0) return n; continue; }
      if (c === "$" && (src[k + 1] === "(" || src[k + 1] === "`")) { const e = readExpansion(src, k, result, lineAt, offset); if (e) { k = e - 1; continue; } }
      if (c === "`") { const e = readExpansion(src, k, result, lineAt, offset); k = e - 1; continue; }
      if (c === "{") level++;
      else if (c === "}") { level--; if (level === 0) return k + 1; }
    }
    return n;
  }
  if (next !== undefined && /[A-Za-z0-9_@*#?$!-]/.test(next)) {
    let k = i + 1;
    if (/[A-Za-z_]/.test(next)) while (k < n && /[A-Za-z0-9_]/.test(src[k])) k++;
    else k++;
    return k;
  }
  return null;
}

// Consumes a here-document body starting at src[i]; an unquoted body is searched for command substitutions.
function readHeredoc(src, i, h, result, lineAt, offset) {
  const n = src.length;
  let body = "";
  // The body is kept on the command that takes it, because `node <<EOF ... EOF` is a program handed to an
  // interpreter as surely as `node -e "..."` is, and a check that reads only arguments would never see it.
  const keep = (text) => { if (h.command && body.length < 20000) body += `${text}\n`; };
  const attach = () => { if (h.command) h.command.heredoc = (h.command.heredoc ?? "") + body; };
  while (i < n) {
    const end = src.indexOf("\n", i);
    const lineEnd = end < 0 ? n : end;
    const text = src.slice(i, lineEnd);
    const compare = h.strip ? text.replace(/^\t+/, "") : text;
    if (compare === h.delimiter) { attach(); return lineEnd + 1; }
    keep(text);
    if (!h.quoted) {
      for (let k = 0; k < text.length; k++) {
        if (text[k] === "\\") { k++; continue; }
        if (text[k] === "$" || text[k] === "`") {
          const e = readExpansion(src, i + k, result, lineAt, offset);
          if (e) k = e - i - 1;
        }
      }
    }
    i = lineEnd + 1;
  }
  attach();
  result.problems.push({ text: `a here-document ending with ${h.delimiter} is not closed`, line: lineAt(n - 1 + offset) });
  return n;
}

// ---------- JavaScript ----------

const CHILD_PROCESS_FUNCTIONS = ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"];

// The arguments of a call, as their text, from just after the opening bracket: ["\"git\"", "[...]", "{ ... }"].
function callArguments(src, start) {
  const args = [];
  let i = start;
  while (i < src.length) {
    const text = firstArgument(src, i);
    args.push(text.trim());
    i += text.length;
    while (src[i] === " " || src[i] === "\n") i++;
    if (src[i] !== ",") break;
    i++;
    while (src[i] === " " || src[i] === "\n") i++;
  }
  return args;
}

// Reads the argument text starting at src[i] up to the next top-level "," or ")"; follows strings and brackets.
function firstArgument(src, i) {
  let level = 0, k = i;
  for (; k < src.length; k++) {
    const c = src[k];
    if (c === '"' || c === "'" || c === "`") {
      for (k++; k < src.length && src[k] !== c; k++) if (src[k] === "\\") k++;
      continue;
    }
    if (c === "(" || c === "[" || c === "{") level++;
    else if (c === ")" || c === "]" || c === "}") { if (level === 0) break; level--; }
    else if (c === "," && level === 0) break;
  }
  return src.slice(i, k).trim();
}

const lineOf = (src, index) => src.slice(0, index).split("\n").length;
const isCommentLine = (src, index) => {
  const lineStart = src.lastIndexOf("\n", index - 1) + 1;
  const before = src.slice(lineStart, index).trim();
  return before.startsWith("//") || before.startsWith("*") || before.startsWith("/*");
};

// Returns { calls: [{ callee, arg, program, line }], problems: [{ text, line }] }. program is the literal program
// name, or null when the first argument is not a string literal. wrappers names local functions whose first argument
// is the program they run.
export function jsProgramCalls(src, wrappers = []) {
  const calls = [], problems = [];
  const names = new Map(); // local name -> child_process function
  const importRe = /import\s*\{([^}]*)\}\s*from\s*["'](?:node:)?child_process["']/g;
  let m;
  const recognised = [];
  while ((m = importRe.exec(src))) {
    recognised.push([m.index, m.index + m[0].length]);
    for (const part of m[1].split(",").map((s) => s.trim()).filter(Boolean)) {
      const [imported, local = imported] = part.split(/\s+as\s+/).map((s) => s.trim());
      if (CHILD_PROCESS_FUNCTIONS.includes(imported)) names.set(local, imported);
    }
  }
  const any = /(?:node:)?child_process/g;
  while ((m = any.exec(src))) {
    if (recognised.some(([a, b]) => m.index >= a && m.index < b)) continue;
    if (isCommentLine(src, m.index)) continue;
    problems.push({ text: "child_process is used other than through a named import this reader follows", line: lineOf(src, m.index) });
  }
  const callees = [...names.keys(), ...wrappers];
  if (!callees.length) return { calls, problems };
  const callRe = new RegExp(`(?<![\\w.$])(${callees.map((c) => c.replace(/[$]/g, "\\$")).join("|")})\\s*\\(`, "g");
  while ((m = callRe.exec(src))) {
    if (isCommentLine(src, m.index)) continue;
    const before = src.slice(Math.max(0, m.index - 9), m.index);
    if (/function\s+$/.test(before)) continue; // the wrapper's own definition
    const all = callArguments(src, m.index + m[0].length);
    const arg = all[0] ?? "";
    const literal = /^(["'])([^"'`$\\]+)\1$/.exec(arg) ?? /^`([^`$\\]+)`$/.exec(arg);
    // The options a child is started with are the third argument of a child_process call. A wrapper takes its own
    // arguments, so nothing is read there: the wrapper's own call is in this list too.
    const options = CHILD_PROCESS_FUNCTIONS.includes(names.get(m[1]) ?? "") ? (all[2] ?? null) : null;
    calls.push({ callee: m[1], fn: names.get(m[1]) ?? null, arg, argsText: all[1] ?? null, options, program: literal ? literal[literal.length - 1] : null, line: lineOf(src, m.index) });
  }
  return { calls, problems };
}

// ---------- network use ----------

// git commands that contact a remote. "remote" and "submodule" are read only as the first word of a shell command,
// because they are ordinary words elsewhere (an option named remote, for example).
export const REMOTE_VERBS = ["fetch", "pull", "push", "clone", "ls-remote", "fetch-pack", "send-pack", "request-pull"];
const REMOTE_SHELL_VERBS = [...REMOTE_VERBS, "remote", "submodule"];
// git's own options, before the verb, that take a separate value: their value is not the verb.
const GIT_OPTIONS_WITH_VALUE = ["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path", "--config-env", "--super-prefix"];

// The verb of a git command, given its arguments: the first word that is not an option or an option's value. Returns
// null when every argument is an expansion this reader cannot see.
export function gitVerb(args) {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === null) return null; // an expansion: what follows cannot be read either
    if (GIT_OPTIONS_WITH_VALUE.includes(a)) { i++; continue; }
    if (a.startsWith("-")) continue;
    return a;
  }
  return null;
}
const NETWORK_PATTERNS = [
  [/from\s+["'](?:node:)?(http|https|net|tls|dgram|dns|http2)["']/, "a network module"],
  [/require\(["'](?:node:)?(http|https|net|tls|dgram|dns|http2)["']\)/, "a network module"],
  [/(?<![\w.])fetch\s*\(|globalThis\s*\.\s*fetch\s*\(/, "fetch"],
  [/new\s+(WebSocket|XMLHttpRequest|EventSource)/, "a network client"],
  [/\/dev\/(tcp|udp)\//, "a shell network redirection"],
  [/\b(urllib|http\.client|socket\.socket|requests\.(get|post))\b/, "a network call in an embedded program"],
  [/createRequire\s*\(/, "a module loader built at run time, which can load any module"],
];
export const NETWORK_PROGRAMS = ["curl", "wget", "nc", "ncat", "netcat", "socat", "telnet", "ssh", "scp", "sftp", "rsync", "ftp", "Invoke-WebRequest"];

// Every place the code could reach a network: [{ path, line, what, text }]. gitWrappers names, per file, the shell
// functions that pass their arguments to git, so their verbs are read too.
export function networkUses(files, readFile, gitWrappers = {}) {
  const hits = [];
  for (const path of [...files.js, ...files.shell]) {
    let text;
    // A file that cannot be read (a link pointing nowhere) is reported as one, rather than stopping the whole scan.
    try { text = readFile(path); } catch (e) { hits.push({ path, line: 0, what: `a file that could not be read (${e.code ?? e.message})`, text: path }); continue; }
    text.split("\n").forEach((line, i) => {
      if (/^\s*(\/\/|#|\*)/.test(line)) return;
      for (const [re, what] of NETWORK_PATTERNS) if (re.test(line)) hits.push({ path, line: i + 1, what, text: line.trim().slice(0, 120) });
    });
    if (files.shell.includes(path)) {
      const wrappers = gitWrappers[path] ?? [];
      const { commands, functions } = shellCommands(text);
      for (const c of commands) {
        const program = c.word.split("/").pop();
        if (NETWORK_PROGRAMS.includes(program)) hits.push({ path, line: c.line, what: `the program ${c.word}`, text: c.word });
        // git by name or by path, a function this file defines (which may pass its arguments to git), and a wrapper
        // the caller named: in each case the first word that is not an option is read as the verb.
        const couldBeGit = program === "git" || wrappers.includes(c.word) || functions.includes(c.word);
        if (!couldBeGit) continue;
        const said = `${c.word} ${c.args.map((a) => a ?? "<a variable>").join(" ")}`.slice(0, 120);
        const verb = gitVerb(c.args);
        if (verb && REMOTE_SHELL_VERBS.includes(verb)) hits.push({ path, line: c.line, what: `git ${verb}, which contacts a remote`, text: said });
        if (c.args.some((a) => a && (a === "--remote" || a.startsWith("--remote=")))) hits.push({ path, line: c.line, what: "a git command with --remote, which contacts a remote", text: said });
      }
    } else {
      const lines = text.split("\n");
      const at = (index) => text.slice(0, index).split("\n").length;
      for (const verb of REMOTE_VERBS) {
        const re = new RegExp(`(["'\`])${verb}\\1`, "g");
        let m;
        while ((m = re.exec(text))) {
          const line = at(m.index);
          hits.push({ path, line, what: `the git verb ${verb}, which contacts a remote`, text: lines[line - 1].trim().slice(0, 120) });
        }
      }
      // "remote" and "submodule" are ordinary words (an option named remote, a sentence), so they count only as the
      // first word of an argument list, and --remote counts anywhere.
      for (const re of [/\[\s*(["'`])(remote|submodule)\1\s*,/g, /(["'`])--remote(=[^"'`]*)?\1/g]) {
        let m;
        while ((m = re.exec(text))) {
          const line = at(m.index);
          hits.push({ path, line, what: "a git command that contacts a remote", text: lines[line - 1].trim().slice(0, 120) });
        }
      }
    }
  }
  return hits;
}

// ---------- the allow list document ----------

// The section of a markdown document from the heading that starts with `title` to the next heading of that level.
export function section(markdown, title) {
  const lines = markdown.split("\n");
  const startIndex = lines.findIndex((l) => l.startsWith(title));
  if (startIndex < 0) return null;
  const level = /^#+/.exec(lines[startIndex])[0].length;
  const end = lines.findIndex((l, k) => k > startIndex && new RegExp(`^#{1,${level}} `).test(l));
  return lines.slice(startIndex + 1, end < 0 ? lines.length : end).join("\n");
}

// Table rows of a markdown fragment as arrays of cell text, header and separator rows removed.
export function tableRows(fragment) {
  const rows = fragment.split("\n").filter((l) => l.startsWith("|")).map((l) => l.slice(1, l.endsWith("|") ? -1 : undefined).split("|").map((c) => c.trim()));
  return rows.filter((r, k) => !(k === 0 || r.every((c) => /^:?-+:?$/.test(c))));
}

const backticked = (cell) => [...cell.matchAll(/`([^`]+)`/g)].map((x) => x[1]);
const PROGRAM_TOKEN = /^(\/[A-Za-z0-9._/-]+|[a-z0-9][a-z0-9._+-]*)$/;

// Section 1 of the allow list: { programs: Map(name -> row text), policyRow: boolean }. A program is a backticked
// word or absolute path in the first column; paths count by their last part too, so /usr/bin/env names env.
export function allowlistPrograms(markdown) {
  const s = section(markdown, "## 1. Programs");
  if (s === null) return null;
  const programs = new Map();
  let policyRow = false;
  for (const row of tableRows(s)) {
    if (/delivery policy names/.test(row[0])) policyRow = true;
    for (const token of backticked(row[0]).filter((t) => PROGRAM_TOKEN.test(t))) {
      programs.set(token, row[0]);
      if (token.includes("/")) programs.set(token.split("/").pop(), row[0]);
    }
  }
  return { programs, policyRow };
}

// Section 2's table of locations on the machine: every backticked path starting with ~/ in the first column.
export function allowlistMachineLocations(markdown) {
  const s = section(markdown, "## 2. Where it writes");
  if (s === null) return null;
  const table = s.split("**In each code repository:**")[0];
  return [...new Set(tableRows(table).flatMap((row) => backticked(row[0]).filter((t) => t.startsWith("~/"))))];
}

// True when a path relative to the home folder (forward slashes) is inside a documented location: "<name>" matches
// one path part, and a location ending in "/" covers everything under it.
export function locationMatches(location, relPath) {
  const rel = location.slice(2);
  const escaped = rel.split(/(<[^>]+>)/).map((part) => (/^<[^>]+>$/.test(part) ? "[^/]+" : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).join("");
  const re = rel.endsWith("/") ? new RegExp(`^${escaped}`) : new RegExp(`^${escaped}$`);
  return re.test(relPath) || (rel.endsWith("/") && `${relPath}/` === rel);
}
