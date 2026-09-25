// compliance.mjs: the command line over lib/compliance-scope.mjs (which frameworks a project's own files point at, and
// the scope a named person confirmed) and lib/compliance-sheet.mjs (the control record built from the project's
// security evidence). docs/decisions/2026-09-25-compliance-lives-in-public-skilliton-as-39ef.md is the design.
// Skilliton assesses and prepares; nothing printed here says a project meets a framework.
//
// Exit codes: 0 complete; 1 the control record is missing or out of date (sheet without --apply); 2 refused, with the
// reason (nothing written); 3 a write or a read failed.

import { Refused, backupFile, newStamp, parseArgs, say, selfCommand, tilde } from "../lib/core.mjs";
import { ConfigError, resolveProject } from "../lib/config.mjs";
import { SecurityRefusal, projectRoot, refusalText, textFieldProblem } from "../lib/security-io.mjs";
import * as scope from "../lib/compliance-scope.mjs";
import * as sheet from "../lib/compliance-sheet.mjs";

export const help = `compliance: which compliance frameworks this project's own files point at, the scope a named person
confirmed, and the control record built from the project's security evidence. Skilliton assesses and prepares; it never
attests, and nothing it prints says a project meets a framework. Whether a framework applies to an organization is a
legal determination the organization makes with its counsel.
--dir names the project folder (default: the current folder).

  compliance scope [--json] [--dir <project>]
      Read the project's own description files for 21 kinds of signal and propose the frameworks they point at, each
      with a confidence and the file and line of every signal, then the intake questions no scan can answer and the
      disclaimer. The files read: .mojocomply.yaml, CLAUDE.md, COMPLIANCE.md, README.md, README.txt, SECURITY.md and
      package.json at the root, and package.json one folder down in apps/, packages/, services/ and workers/. A file
      over 512 KB, a symbolic link or a hard link is named and not read; nothing outside the project is read. --json
      prints the proposal as JSON. Writes nothing.

  compliance scope --apply --decided-by <person> [--dir <project>]
      Record in .skilliton/compliance/scope.json, with the person and the time, the proposed frameworks that rest on
      a strong signal of current activity and have a library here. Recording is additive: a framework recorded
      earlier stays recorded, and the intake answers are kept. The previous file is backed up. Without --decided-by
      it is refused and nothing is written.

  compliance sheet [--json] [--apply] [--dir <project>]
      Build the control record: for every control of each framework in the confirmed scope, walk the library's
      crosswalk to NIST CSF 2.0, then the baseline crosswalk to the project's security controls, then their records
      and freshness (read through the security module). A row is evidenced when every mapped control has a current
      observed record, partial when some do or some records are stale, not_started when none, and not_applicable when
      the control's own gate (answered in the scope file's intake) or the project's applicability decisions say so.
      Each row lists the records behind it and, when not evidenced, what a person must supply. Without --apply it says
      whether the file (compliance.sheetFile, default docs/COMPLIANCE-CONTROLS.md) is current and how many rows would
      change, and exits 1 when it is missing or out of date. --apply writes the block between the
      skilliton:compliance-sheet markers, backs up the previous file, and prints how many rows changed; an unchanged
      sheet is not written. --json prints the computed sheet as JSON.

SKILLITON_FRAMEWORKS_DIR names another frameworks folder than the plugin's own (the tests use it).
Exit codes: 0 complete; 1 the control record is missing or out of date (sheet without --apply); 2 refused, with the
reason, nothing written; 3 a read or write failed.`;

const SUBCOMMANDS = {
  scope: { flags: ["json", "apply"], options: ["dir", "decided-by"] },
  sheet: { flags: ["json", "apply"], options: ["dir"] },
};
const ALL_FLAGS = [...new Set(Object.values(SUBCOMMANDS).flatMap((s) => s.flags))];
const ALL_OPTIONS = [...new Set(Object.values(SUBCOMMANDS).flatMap((s) => s.options))];

function parse(argv) {
  const o = parseArgs(argv, { flags: ALL_FLAGS, options: ALL_OPTIONS }, "compliance");
  if (o.help) return { help: true };
  const [sub, ...extra] = o._;
  if (sub === undefined) throw new Refused(`compliance needs a subcommand: ${Object.keys(SUBCOMMANDS).join(" or ")}. Run: ${selfCommand()} compliance --help`);
  if (!Object.hasOwn(SUBCOMMANDS, sub)) throw new Refused(`unknown compliance subcommand; use ${Object.keys(SUBCOMMANDS).join(" or ")}`);
  if (extra.length) throw new Refused(`compliance ${sub} got an unexpected extra argument (not shown); quote values that contain spaces`);
  const spec = SUBCOMMANDS[sub];
  for (const key of Object.keys(o)) {
    if (key === "_" || spec.flags.includes(key) || spec.options.includes(key)) continue;
    throw new Refused(`--${key} does not apply to "compliance ${sub}". Run: ${selfCommand()} compliance --help`);
  }
  return { sub, o };
}

// The project folder. resolveProject refuses an unusable configuration, and a project still under the earlier names
// (whose records live in the earlier folder), before anything is read.
function projectDir(o) {
  let root;
  try { root = projectRoot(o.dir ?? process.cwd()); } catch (e) {
    if (!(e instanceof SecurityRefusal) || e.kind !== "invalid") throw e;
    throw new Refused(o.dir === undefined ? "the current folder cannot be used as the project folder"
      : "the --dir folder does not exist or is not a folder (the value is not shown)");
  }
  resolveProject(root);
  return root;
}

// Plain words at a readable width, each line starting with indent.
function wrap(text, indent = "  ", width = 100) {
  const lines = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && indent.length + line.length + 1 + word.length > width) { lines.push(indent + line); line = word; }
    else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(indent + line);
  return lines;
}

// ---------- scope ----------

const TIMING = {
  now: "now: signals of current activity",
  conditional: "conditional: relevant once the stated condition holds",
  watch: "watch: supporting signals only; raise it at intake, do not scope on it",
};
const LIBRARY = {
  shipped: "a library for it ships with Skilliton",
  not_shipped: "no library for it ships with Skilliton; a person assesses it separately",
  not_encoded: "not encoded as a library anywhere yet",
};

function whyNotRecorded(r) {
  if (r.library !== "shipped") return LIBRARY[r.library];
  if (r.timing !== "now") return `its timing is ${r.timing}`;
  if (r.confidence === "weak") return "its confidence is weak";
  return "no strong signal";
}

function renderFramework(r, n) {
  const lines = [``, `  ${n}. ${r.label} [${r.id}]`, `     library: ${LIBRARY[r.library]}`, `     timing: ${TIMING[r.timing]}`,
    `     confidence: ${r.confidence} (signal score ${r.score})`,
    `     recorded by --apply: ${r.recordable ? "yes" : `no, ${whyNotRecorded(r)}`}`, "     signals:"];
  for (const t of r.triggers) {
    const places = r.signals.filter((s) => s.id === t.signal).map((s) => `${s.file}:${s.line} "${s.match}"`).join(", ");
    lines.push(`       ${t.signal} (${t.weight}, ${t.posture}) at ${places}`, ...wrap(t.appliesWhen, "         "));
  }
  if (r.variant) lines.push(`     ${r.variant.dimension}: ${r.variant.label} (proposed, not confirmed)`, ...wrap(r.variant.note, "       "));
  if (r.variantOpen) lines.push(...wrap(r.variantOpen, "     "));
  lines.push("     determination:", ...wrap(r.determination, "       "));
  return lines;
}

function renderProposal(p) {
  const kb = p.knowledgeBase;
  const out = [`Compliance scope proposal for this project (knowledge base ${kb.version}, ${kb.status})`];
  if (kb.status !== "approved") out.push("The knowledge base is not approved by its owner, so this proposal is for internal use only.");
  out.push(`Files read: ${p.subject.scanned.length ? p.subject.scanned.join(", ") : "none of the files the scan reads exist here"}`);
  for (const s of p.subject.skipped) out.push(`Not read: ${s.file} (${s.reason})`);
  out.push("", ...wrap(p.disclaimer), "", `Signals found (${p.signals.length}):`);
  if (!p.signals.length) out.push("  none: nothing in the files read matched a known signal.");
  for (const s of p.signals) out.push(`  ${s.id}: ${s.evidence.map((e) => `${e.file}:${e.line} "${e.match}"`).join(", ")}`);
  const scoped = p.frameworks.filter((r) => r.timing !== "watch"), watching = p.frameworks.filter((r) => r.timing === "watch");
  out.push("", `Frameworks the signals point at (${scoped.length}):`);
  if (!scoped.length) out.push("  none.");
  scoped.forEach((r, i) => out.push(...renderFramework(r, i + 1)));
  if (watching.length) {
    out.push("", `Watch only, not proposed for scope (${watching.length}): supporting signals only; raise them at intake.`);
    for (const r of watching) out.push(`  ${r.label} [${r.id}]: ${r.signals.map((s) => `${s.id} at ${s.file}:${s.line}`).join(", ")}`);
  }
  out.push("", `No signal pointed at (${p.notPointedAt.length}):`);
  for (const f of p.notPointedAt) out.push(`  ${f.label} [${f.id}]`);
  const absence = "That is an observation about the files read, not a determination that these frameworks do not apply. Confirm at intake.";
  if (p.notPointedAt.length) out.push(...wrap(absence));
  out.push("", `Intake questions no scan can answer (${p.intakeQuestions.length}):`);
  for (const q of p.intakeQuestions) out.push(...wrap(`- ${q}`));
  return out;
}

function checkPerson(o) {
  if (!o.apply) return;
  const person = o["decided-by"];
  const problem = person === undefined ? "missing" : textFieldProblem(person, 120);
  if (problem) {
    throw new Refused("compliance scope --apply needs --decided-by <person>, the name of whoever confirms the scope "
      + `(it is ${problem}; the value is not shown). `
      + "Nothing is recorded without a named person. Nothing was written.");
  }
}

function scopeCommand({ o }) {
  if (o.json && o.apply) throw new Refused("compliance scope: --json and --apply cannot be combined; preview with --json, then record with --apply");
  checkPerson(o);
  const root = projectDir(o);
  const proposal = scope.proposeScope(root);
  if (o.json) { say(JSON.stringify(proposal, null, 2)); return 0; }
  for (const line of renderProposal(proposal)) say(line);
  say("");
  if (!o.apply) {
    const recordable = proposal.frameworks.filter((r) => r.recordable).map((r) => r.id);
    say(`--apply would record: ${recordable.length ? recordable.join(", ") : "no framework (the file would say none is in scope)"}.`);
    say(`To record it: ${selfCommand()} compliance scope --apply --decided-by "<your name>"`);
    return 0;
  }
  const plan = scope.planScope(root, proposal, o["decided-by"]);
  const stamp = newStamp();
  const result = scope.writeScope(root, plan, { beforeReplace: (path) => {
    try { return backupFile("compliance", path, stamp); } catch {
      throw new scope.ComplianceRefusal("the backup of the scope file could not be written, so it was not changed", "failed");
    }
  } });
  say(`Recorded ${result.path}: ${plan.scope.frameworks.length ? plan.scope.frameworks.map((f) => f.id).join(", ") : "no framework in scope"}.`);
  if (plan.added.length) say(`Added now: ${plan.added.join(", ")}.`);
  if (plan.kept.length) say(`Kept from the earlier scope (recording is additive): ${plan.kept.join(", ")}.`);
  for (const r of plan.notRecorded) say(`Not recorded: ${r.id}, ${whyNotRecorded(r)}.`);
  if (result.backup) say(`Backup of the previous file: ${tilde(result.backup)}`);
  return 0;
}

// ---------- sheet ----------

function sheetCommand({ o }) {
  if (o.json && o.apply) throw new Refused("compliance sheet: --json and --apply cannot be combined");
  const root = projectDir(o);
  if (o.json) { say(JSON.stringify(sheet.computeSheet(root), null, 2)); return 0; }
  const stamp = newStamp();
  const result = sheet.writeSheet(root, { apply: Boolean(o.apply), beforeReplace: (path) => {
    try { return backupFile("compliance", path, stamp); } catch {
      throw new scope.ComplianceRefusal("the backup of the control record could not be written, so it was not changed", "failed");
    }
  } });
  const s = result.sheet;
  say(`Control record: ${result.path}`);
  say(s.scope ? `Scope confirmed by ${s.scope.decidedBy} on ${s.scope.decidedAt}: ${s.frameworks.map((f) => f.id).join(", ") || "no framework"}.`
    : `No confirmed scope yet (${scope.SCOPE_REL}). Run: ${selfCommand()} compliance scope`);
  for (const f of s.frameworks.filter((x) => !x.library)) say(`${f.id}: no library ships with Skilliton; a person assesses it separately.`);
  if (!s.crosswalk.reviewed) say("The crosswalk from the baseline security controls to NIST CSF 2.0 has not been reviewed yet.");
  for (const w of s.warnings) say(w);
  say(sheet.countLine(s.counts));
  const waiting = s.frameworks.flatMap((f) => f.controls.filter((c) => c.needsPerson).map((c) => ({ f, c })));
  if (waiting.length) say(`Needs a person (${waiting.length}):`);
  for (const { f, c } of waiting) say(...wrap(`${f.id}: ${c.id}: ${c.needsPerson.reason}. Supply: ${c.needsPerson.evidenceTypes.join(", ")}`, "  "));
  if (o.apply) {
    say(result.written ? `Wrote ${result.path}: ${result.changedRows} row(s) changed.` : `${result.path} is current: 0 rows changed, nothing written.`);
    if (result.backup) say(`Backup of the previous file: ${tilde(result.backup)}`);
    return 0;
  }
  if (!result.due) { say(`${result.path} is current: 0 rows would change.`); return 0; }
  say(`${result.path} is ${result.state === "missing" ? "missing" : "out of date"}: ${result.changedRows} row(s) would change.`);
  say(`To write it: ${selfCommand()} compliance sheet --apply`);
  return 1;
}

const HANDLERS = { scope: scopeCommand, sheet: sheetCommand };

export async function run(argv) {
  let label = "compliance";
  try {
    const parsed = parse(argv);
    if (parsed.help) { say(help); return 0; }
    label = `compliance ${parsed.sub}`;
    return HANDLERS[parsed.sub](parsed);
  } catch (e) {
    if (e instanceof scope.ComplianceRefusal) {
      if (e.kind === "failed") { console.error(`skilliton: ${label}: operation failed: ${e.message}`); return 3; }
      throw new Refused(`${label}: ${e.message}`);
    }
    if (e instanceof SecurityRefusal) {
      const text = `${label}: ${e.kind === "failed" ? "operation failed" : "refused"} (${e.code}): ${refusalText(e.code)}${e.detail ? `. ${e.detail}` : ""}.`;
      if (e.kind === "failed") { console.error(`skilliton: ${text}`); return 3; }
      throw new Refused(`${text} Nothing was written.`);
    }
    if (e instanceof ConfigError) {
      if (e.kind === "failed") { console.error(`skilliton: ${label}: ${e.message}`); return 3; }
      throw new Refused(`${label}: ${e.message}`);
    }
    throw e;
  }
}
