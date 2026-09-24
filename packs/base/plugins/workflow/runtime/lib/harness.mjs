// harness.mjs: the harness block engine. The markers, the template file, and the plan for one project file.
// `skilliton harness` is commands/harness.mjs; prepare, migrations, records and remove use this module directly,
// which is why the block machinery is an engine here and not private to the command. Node only, no dependencies.
//
// The block sits between START_LINE and END_LINE, each on its own line. Text outside the markers is never changed.
// A file with more than one start or end marker, or a marker without its partner, is refused and nothing is written.

import { join } from "node:path";
import { ConfigError, resolveProject, templateVars } from "./config.mjs";
import { LEGACY_CONFIG_REL, LEGACY_HARNESS_PREFIX, LEGACY_NAME } from "./legacy-names.mjs";
import { PLUGIN_ROOT, isFile, linkedWriteProblem, readBytes, refuse, statOrNull, tilde } from "./core.mjs";

const HARNESS_TEMPLATE = join(PLUGIN_ROOT, "templates", "harness.md");
const START_LINE = "<!-- skilliton:harness:start v1 -->";
const END_LINE = "<!-- skilliton:harness:end -->";
const HARNESS_FILES = ["CLAUDE.md", "AGENTS.md"];

// Lines with their byte offsets. body excludes the line ending (and a leading byte order mark on line 1).
function lineSpans(text) {
  const spans = [];
  let pos = 0;
  while (pos < text.length) {
    const nl = text.indexOf("\n", pos);
    const end = nl === -1 ? text.length : nl + 1;
    let body = text.slice(pos, nl === -1 ? text.length : nl).replace(/\r$/, "");
    let bom = 0;
    if (pos === 0 && body.startsWith("\xEF\xBB\xBF")) { bom = 3; body = body.slice(3); }
    spans.push({ start: pos, end, body, bom });
    pos = end;
  }
  return spans;
}

const START_EXACT = /^<!-- skilliton:harness:start v(\d+) -->$/;

// Returns null when the file has no block, the block's offsets when it has exactly one, and refuses otherwise.
function findBlock(text, label) {
  const spans = lineSpans(text);
  const starts = [], ends = [];
  spans.forEach((s, i) => {
    const t = s.body.trim();
    if (t.startsWith("<!-- skilliton:harness:start")) {
      if (!START_EXACT.test(t)) refuse(`${label} line ${i + 1} starts like a harness start marker but is not exactly "${START_LINE}". Fix that line by hand, then run again.`);
      starts.push(i);
    } else if (t.startsWith("<!-- skilliton:harness:end")) {
      if (t !== END_LINE) refuse(`${label} line ${i + 1} starts like a harness end marker but is not exactly "${END_LINE}". Fix that line by hand, then run again.`);
      ends.push(i);
    }
  });
  const nums = (list) => list.map((i) => i + 1).join(", ");
  if (starts.length > 1) refuse(`${label} has more than one harness start marker (lines ${nums(starts)}). A file holds exactly one block; remove the extra block by hand, then run again.`);
  if (ends.length > 1) refuse(`${label} has more than one harness end marker (lines ${nums(ends)}). A file holds exactly one block; remove the extra marker by hand, then run again.`);
  if (starts.length && !ends.length) refuse(`${label} has a harness start marker (line ${starts[0] + 1}) without an end marker. Add "${END_LINE}" where the block ends, or delete the start marker, then run again.`);
  if (ends.length && !starts.length) refuse(`${label} has a harness end marker (line ${ends[0] + 1}) without a start marker. Add "${START_LINE}" where the block begins, or delete the end marker, then run again.`);
  if (!starts.length) return null;
  if (ends[0] < starts[0]) refuse(`${label} has its harness end marker (line ${ends[0] + 1}) before its start marker (line ${starts[0] + 1}). Fix the order by hand, then run again.`);
  const s = spans[starts[0]], e = spans[ends[0]];
  return {
    startOffset: s.start + s.bom, endOffset: e.end, innerStart: s.end, innerEnd: e.start,
    startLineNo: starts[0] + 1, endLineNo: ends[0] + 1, version: START_EXACT.exec(s.body.trim())[1],
  };
}

const detectEol = (text) => { const nl = text.indexOf("\n"); return nl > 0 && text[nl - 1] === "\r" ? "\r\n" : "\n"; };
// The template may name project values as {{key}} (config.mjs templateVars). Without vars, placeholders stay as written.
const templateBody = (template, vars = null) => {
  let body = template.replace(/\r\n/g, "\n");
  if (vars) {
    body = body.replace(/\{\{([A-Za-z]+)\}\}/g, (_, key) => {
      if (!Object.hasOwn(vars, key)) refuse(`the harness template names {{${key}}}, which is not a project value (known: ${Object.keys(vars).join(", ")})`);
      return vars[key];
    });
  }
  return body.endsWith("\n") ? body : body + "\n";
};

// Harness template values for one project. An unusable project configuration is refused (exit 2) or, when a file
// could not be read, reported as a failed operation (exit 3), because the block names this project's record files.
function projectTemplateVars(dir) {
  try { return templateVars(resolveProject(dir)); } catch (e) {
    if (e instanceof ConfigError && e.kind === "invalid") refuse(`the harness block names this project's record files, and the project configuration cannot be used: ${e.message}`);
    throw e;
  }
}

function renderBlock(template, eol, vars = null) {
  const block = `${START_LINE}\n${templateBody(template, vars)}${END_LINE}\n`;
  return eol === "\r\n" ? block.replace(/\n/g, "\r\n") : block;
}

function readHarnessTemplate(path) {
  if (!isFile(path)) refuse(`harness template ${tilde(path)} not found`);
  const text = readBytes(path);
  if (!text.trim()) refuse(`harness template ${tilde(path)} is empty`);
  lineSpans(text).forEach((s, i) => {
    if (s.body.trim().startsWith("<!-- skilliton:harness:")) refuse(`harness template ${tilde(path)} line ${i + 1} holds a harness marker; the template must hold only the block's contents`);
  });
  return text;
}

// Remove the block and one blank line next to it: the one before it, or at the very top of a file the one after it.
function removeBlockAt(text, found) {
  let before = text.slice(0, found.startOffset);
  let after = text.slice(found.endOffset);
  if (/(^|\n)\r?\n$/.test(before)) before = before.replace(/\r?\n$/, "");
  else if (/^(\xEF\xBB\xBF)?$/.test(before) && /^\r?\n/.test(after)) after = after.replace(/^\r?\n/, "");
  return before + after;
}

// The first line of text that starts a harness marker written under the earlier names, as a 1-based number, or 0.
function legacyBlockLine(text) {
  const index = lineSpans(text).findIndex((s) => s.body.trim().startsWith(LEGACY_HARNESS_PREFIX));
  return index + 1;
}

function planHarnessFile(dir, name, template, undo, vars = null) {
  const path = join(dir, name);
  const linked = linkedWriteProblem(dir, name);
  if (linked) refuse(`${linked}. Nothing was read or written. Replace it with the file itself, then run again.`);
  const st = statOrNull(path);
  if (st && !st.isFile()) refuse(`${tilde(path)} exists but is not a regular file`);
  const exists = !!st;
  const text = exists ? readBytes(path) : "";
  // A block written under the earlier names is neither current nor absent: adding a second block would leave the old
  // one telling the assistant to run the earlier commands, and removing it is the migration's job.
  const legacyLine = legacyBlockLine(text);
  if (legacyLine) refuse(`${name} line ${legacyLine} holds a harness block written under the earlier ${LEGACY_NAME} names. Nothing was written. In a project with ${LEGACY_CONFIG_REL}, run migrate, which replaces it; otherwise delete that block's marker lines and everything between them, then run again`);
  const plan = { name, path, exists, text, next: text, changed: false, summary: "" };
  if (undo) {
    const found = exists ? findBlock(text, name) : null;
    if (!exists) plan.summary = "does not exist; nothing to remove";
    else if (!found) plan.summary = "has no harness block; nothing to remove";
    else {
      plan.next = removeBlockAt(text, found);
      plan.changed = true;
      plan.summary = `remove the harness block (lines ${found.startLineNo} to ${found.endLineNo}) and one blank line next to it`;
    }
    return plan;
  }
  const eol = detectEol(text);
  const block = renderBlock(template, eol, vars);
  if (!exists) {
    plan.next = block;
    plan.summary = "does not exist; create it containing only the harness block";
  } else {
    const found = findBlock(text, name);
    if (found) {
      plan.next = text.slice(0, found.startOffset) + block + text.slice(found.endOffset);
      plan.summary = plan.next === text ? "harness block is already current; nothing to change"
        : `replace the harness block (lines ${found.startLineNo} to ${found.endLineNo}) with the current template; nothing outside the markers changes`;
    } else if (text === "") {
      plan.next = block;
      plan.summary = "is empty; write the harness block into it";
    } else {
      plan.next = text + (text.endsWith("\n") ? "" : eol) + eol + block;
      plan.summary = "add the harness block after a blank line at the end; the existing content is kept byte for byte";
    }
  }
  plan.changed = plan.next !== text || !exists;
  return plan;
}

// ---------- exports ----------

export {
  HARNESS_TEMPLATE, START_LINE, END_LINE, HARNESS_FILES,
  lineSpans, findBlock, detectEol, templateBody, projectTemplateVars, renderBlock, readHarnessTemplate,
  removeBlockAt, legacyBlockLine, planHarnessFile,
};
