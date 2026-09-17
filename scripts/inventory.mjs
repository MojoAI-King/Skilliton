// inventory.mjs: what the Skilliton plugins start and where they reach outside a repository, read from the code, and
// what docs/IT-ALLOWLIST.md says about it. Used by scripts/allowlist.test.mjs (the allow list matches the code, B26)
// and scripts/footprint.test.mjs (the small-footprint rules, B28). Node built-ins only.
//
// Scope: every JavaScript file and shell script under packs/base/plugins/ except evals/ (eval fixtures run only in a
// company's evaluation runs, never on a developer's machine), the plugin launcher bin/skilliton, scripts/skilliton.mjs,
// scripts/setup.mjs, and scripts/scrub-check.sh (the runtime runs a skills repository's copy of it in import and
// propose).
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

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
export const PLUGINS = "packs/base/plugins";
export const ALLOWLIST_DOC = "docs/IT-ALLOWLIST.md";

const toPosix = (p) => p.split(sep).join("/");

function walk(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) walk(path, out);
    else if (st.isFile()) out.push(path);
  }
  return out;
}

// Files in scope, as repository-relative paths with forward slashes: { js: [...], shell: [...] }.
export function scopeFiles(root = REPO) {
  const plugin = walk(join(root, PLUGINS)).map((p) => toPosix(relative(root, p))).filter((p) => !/\/evals\//.test(p));
  const isShell = (p) => {
    if (p.endsWith(".sh")) return true;
    if (/\.[a-z0-9]+$/i.test(p.split("/").pop())) return false;
    return /^#!.*\b(ba)?sh\b/.test(readFileSync(join(root, p), "utf8").split("\n", 1)[0]);
  };
  const js = [...plugin.filter((p) => /\.(mjs|cjs|js)$/.test(p)), "scripts/skilliton.mjs", "scripts/setup.mjs"];
  const shell = [...plugin.filter(isShell), "scripts/scrub-check.sh"];
  return { js: js.sort(), shell: shell.sort() };
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
  exec: ["-a"], command: [], builtin: [], nohup: [], time: [], nice: ["-n"], env: ["-u", "-C", "-S"], xargs: ["-n", "-I", "-L", "-P", "-d", "-s", "-E", "-a"],
  timeout: ["-s", "-k"], sudo: ["-u", "-g", "-C", "-D", "-h", "-p", "-U"], doas: ["-u", "-C"], stdbuf: ["-i", "-o", "-e"],
};

// Returns { commands: [{ word, line, args }], dynamic: [{ text, line }], functions: [names], problems: [{ text, line }] }.
// `word` is the command word as written (a path stays a path) and `args` its arguments, each the argument's text
// without quotes or null when it holds an expansion. Builtins, keywords and the script's own functions are included in
// commands, and callers filter them with SHELL_BUILTINS and `functions`.
export function shellCommands(text) {
  const result = { commands: [], dynamic: [], functions: new Set(), problems: [] };
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
  const record = (word, index) => {
    current = { word, line: line(index), args: [] };
    result.commands.push(current);
    commandName = word;
    const base = word.split("/").pop();
    if (Object.hasOwn(RUNS_NEXT, base)) runsNext = { name: base, skipNext: false, needDuration: base === "timeout" };
    else runsNext = null;
    pendingScriptArg = base === "trap" ? "trap" : null;
    if (base === "eval") result.problems.push({ text: "eval runs text this reader cannot see", line: line(index) });
  };

  const endCommand = () => { expectCommand = true; runsNext = null; pendingScriptArg = null; commandName = null; current = null; };
  const argument = (w) => { if (current) current.args.push(w.literal); };

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

    if (heredocDelimiter) { heredocs.push({ delimiter: w.literal ?? w.raw.replace(/["'\\]/g, ""), quoted: /["'\\]/.test(w.raw), strip: heredocDelimiter.strip }); heredocDelimiter = null; continue; }
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

    if (runsNext && !expectCommand) {
      const r = runsNext;
      argument(w);
      if (r.name === "command" && /^-[vV]+$/.test(w.raw)) { runsNext = null; continue; } // a lookup, not a run
      if (r.skipNext) { r.skipNext = false; continue; }
      if (w.raw.startsWith("-") && w.raw !== "-") { if (RUNS_NEXT[r.name].includes(w.raw)) r.skipNext = true; continue; }
      if (r.name === "env" && /^[A-Za-z_][A-Za-z0-9_]*=/.test(w.raw)) continue;
      if (r.needDuration) { r.needDuration = false; continue; }
      runsNext = null;
      expectCommand = true; // this word is the command the wrapper runs
    }

    if (commandName !== null && !expectCommand) {
      const base = commandName.split("/").pop();
      if ((base === "bash" || base === "sh") && w.raw === "-c") pendingScriptArg = "-c";
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

    if (w.literal === null) { result.dynamic.push({ text: w.raw, line: line(at) }); expectCommand = false; commandName = w.raw; runsNext = null; continue; }
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
  while (i < n) {
    const end = src.indexOf("\n", i);
    const lineEnd = end < 0 ? n : end;
    const text = src.slice(i, lineEnd);
    const compare = h.strip ? text.replace(/^\t+/, "") : text;
    if (compare === h.delimiter) return lineEnd + 1;
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
  result.problems.push({ text: `a here-document ending with ${h.delimiter} is not closed`, line: lineAt(n - 1 + offset) });
  return n;
}

// ---------- JavaScript ----------

const CHILD_PROCESS_FUNCTIONS = ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"];

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
    const arg = firstArgument(src, m.index + m[0].length);
    const literal = /^(["'])([^"'`$\\]+)\1$/.exec(arg) ?? /^`([^`$\\]+)`$/.exec(arg);
    calls.push({ callee: m[1], arg, program: literal ? literal[literal.length - 1] : null, line: lineOf(src, m.index) });
  }
  return { calls, problems };
}

// ---------- network use ----------

// git commands that contact a remote. "remote" and "submodule" are read only as the first word of a shell command,
// because they are ordinary words elsewhere (an option named remote, for example).
export const REMOTE_VERBS = ["fetch", "pull", "push", "clone", "ls-remote", "fetch-pack", "send-pack", "request-pull"];
const REMOTE_SHELL_VERBS = [...REMOTE_VERBS, "remote", "submodule"];
const NETWORK_PATTERNS = [
  [/from\s+["'](?:node:)?(http|https|net|tls|dgram|dns|http2)["']/, "a network module"],
  [/require\(["'](?:node:)?(http|https|net|tls|dgram|dns|http2)["']\)/, "a network module"],
  [/(?<![\w.])fetch\s*\(/, "fetch"],
  [/new\s+(WebSocket|XMLHttpRequest|EventSource)/, "a network client"],
  [/\/dev\/(tcp|udp)\//, "a shell network redirection"],
  [/\b(urllib|http\.client|socket\.socket|requests\.(get|post))\b/, "a network call in an embedded program"],
];
export const NETWORK_PROGRAMS = ["curl", "wget", "nc", "ncat", "netcat", "socat", "telnet", "ssh", "scp", "sftp", "rsync", "ftp", "Invoke-WebRequest"];

// Every place the code could reach a network: [{ path, line, what, text }]. gitWrappers names, per file, the shell
// functions that pass their arguments to git, so their verbs are read too.
export function networkUses(files, readFile, gitWrappers = {}) {
  const hits = [];
  for (const path of [...files.js, ...files.shell]) {
    const text = readFile(path);
    text.split("\n").forEach((line, i) => {
      if (/^\s*(\/\/|#|\*)/.test(line)) return;
      for (const [re, what] of NETWORK_PATTERNS) if (re.test(line)) hits.push({ path, line: i + 1, what, text: line.trim().slice(0, 120) });
    });
    if (files.shell.includes(path)) {
      const wrappers = gitWrappers[path] ?? [];
      for (const c of shellCommands(text).commands) {
        if (NETWORK_PROGRAMS.includes(c.word.split("/").pop())) hits.push({ path, line: c.line, what: `the program ${c.word}`, text: c.word });
        if (c.word !== "git" && !wrappers.includes(c.word)) continue;
        const verb = c.args.find((a) => a && !a.startsWith("-") && a !== "-C");
        if (verb && REMOTE_SHELL_VERBS.includes(verb)) hits.push({ path, line: c.line, what: `git ${verb}, which contacts a remote`, text: `${c.word} ${c.args.filter(Boolean).join(" ")}`.slice(0, 120) });
      }
    } else {
      const lines = text.split("\n");
      for (const verb of REMOTE_VERBS) {
        const re = new RegExp(`(["'\`])${verb}\\1`, "g");
        let m;
        while ((m = re.exec(text))) {
          const line = text.slice(0, m.index).split("\n").length;
          hits.push({ path, line, what: `the git verb ${verb}, which contacts a remote`, text: lines[line - 1].trim().slice(0, 120) });
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
