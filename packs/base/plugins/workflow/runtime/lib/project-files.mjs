// project-files.mjs: the files a layout-2 project gets from Skilliton (docs/CONTRACTS.md sections 10 and 11). Record
// templates in an explicit "not yet assessed" state, the entry-folder READMEs, the security READMEs, the .gitignore
// lines, the decision and lesson entry templates, and the managed index sections that `skilliton index` regenerates.
//
// A created file states only what is known when it is created: no invented priorities, dates, owners or completion
// claims. prepare never rewrites a file that already exists. Nothing here reads or writes files, and nothing here
// imports from outside the plugin folder.
//
// Adapted from the prototype's scripts/project-files.mjs (commit 23aae41). Layout 2 has no copied runtime and no
// skillgate:project blocks; what the prototype wrote is frozen in prototype-v1.mjs for migration 0002. The starter
// security catalog now ships as catalogs/<catalogVersion>.json in this plugin.

import { posix } from "node:path";
import { DEFAULTS, formatRecordHeader } from "./config.mjs";

export const CATALOG_REL = ".skilliton/security/catalog.json";
export const SECURITY_README_REL = "docs/security/README.md";
export const RECORDS_README_REL = ".skilliton/security/records/README.md";
export const REPORT_REL = ".skilliton/security/REPORT.md";
export const REPORT_MARKER = "<!-- skilliton-security-evidence-report:v1 -->";
export const MIGRATIONS_DIR = ".skilliton/migrations";
export const LOCK_REL = ".skilliton/prepare.lock";
const GITIGNORE_COMMENT = "# Skilliton setup lock and private evidence";
// What preparation writes where a handoff time will go, until a session writes one. The project state reads it as
// "no handoff yet" rather than as a time it cannot make sense of (runtime/lib/lifecycle.mjs).
export const HANDOFF_PLACEHOLDER = "not yet assessed";
export const GITIGNORE_LINES = ["/.skilliton/prepare.lock", "/.skilliton/private-evidence/"];

export const ROLE_LABELS = {
  status: "status record",
  backlog: "backlog",
  backlogArchive: "completed backlog archive",
  roadmap: "roadmap",
  decisions: "decisions record",
  lessons: "lessons record",
  handoff: "handoff",
  handoffArchive: "handoff archive",
  maintain: "maintenance checklist",
};

// Task states from docs/CONTRACTS.md section 11. A task in a closed state is not open.
export const TASK_STATES = ["planned", "in-progress", "blocked", "review", "done-local", "merged", "released", "verified", "abandoned"];
export const CLOSED_TASK_STATES = ["done-local", "merged", "released", "verified", "abandoned"];

const code = (text) => `\`${text}\``;
// kindText is the record's own kind sentence (for example "Living." or "Reference. Current work is in ..."), never
// the "Kind: " prefix: header supplies that (project.recordHeader, or DEFAULTS.recordHeader with no project in hand),
// so a project that configures prepare.recordHeader gets it on every generated file, not only the ones with an
// explicit project argument.
const doc = (title, kindText, paragraphs, header = DEFAULTS.recordHeader) => `# ${title}\n\n${formatRecordHeader(header, kindText)}\n\n${paragraphs.join("\n\n")}\n`;
const branchList = (project) => project.integrationBranches.join(", ");

// ---------- managed index sections ----------

export const INDEX_KINDS = ["decisions", "lessons", "tasks"];
export const INDEX_RECORD_ROLE = { decisions: "decisions", lessons: "lessons", tasks: "status" };
export const indexStartMarker = (kind) => `<!-- skilliton:index:${kind}:start -->`;
export const indexEndMarker = (kind) => `<!-- skilliton:index:${kind}:end -->`;

const cell = (value) => (value === null || value === undefined || value === "" ? "(missing)" : String(value).replace(/\|/g, "\\|"));

// The managed section for one index, with "\n" line endings and a final newline. entries are already sorted by ID
// and, for tasks, already limited to open tasks. The output depends only on its arguments, so every clone that holds
// the same entries writes the same bytes.
export function renderIndexSection(kind, { dir, recordPath, entries }) {
  const link = (id) => posix.relative(posix.dirname(recordPath), `${dir}/${id}.md`);
  const lines = [indexStartMarker(kind)];
  if (kind === "tasks") {
    lines.push(`Open tasks in ${code(`${dir}/`)} (every state except ${CLOSED_TASK_STATES.slice(0, -1).join(", ")} and ${CLOSED_TASK_STATES.at(-1)}), sorted by ID. ${code("skilliton index")} writes this list from the task records; edit the task records, not the list.`, "");
    if (!entries.length) lines.push("No open tasks.");
    else {
      lines.push("| ID | Title | State | Branch | Owner | Updated |", "|---|---|---|---|---|---|");
      for (const e of entries) lines.push(`| [${e.id}](${link(e.id)}) | ${cell(e.title)} | ${cell(e.state)} | ${cell(e.branch)} | ${cell(e.owner)} | ${cell(e.updated)} |`);
    }
  } else {
    const noun = kind === "decisions" ? "decision" : "lesson";
    lines.push(`${noun[0].toUpperCase()}${noun.slice(1)} entries in ${code(`${dir}/`)}, sorted by ID. ${code("skilliton index")} writes this list from the entries; edit the entries, not the list.`, "");
    if (!entries.length) lines.push(`No ${noun} entries yet.`);
    else {
      lines.push("| ID | Title | Status | Date |", "|---|---|---|---|");
      for (const e of entries) lines.push(`| [${e.id}](${link(e.id)}) | ${cell(e.title)} | ${cell(e.status)} | ${cell(e.date)} |`);
    }
  }
  lines.push(indexEndMarker(kind));
  return lines.join("\n") + "\n";
}

// ---------- records ----------

export function recordTemplate(role, project) {
  const a = project.artifacts, d = project.directories;
  const h = project.recordHeader;
  switch (role) {
    case "status":
      return doc("Project status", "Living.", [
        "Current state: not yet assessed.",
        `Read ${code(a.handoff)} for the next step and ${code(a.backlog)} for outstanding work. Keep branch-complete, merged, deployed and verified separate; one task's result does not make the whole project complete.`,
        "## Open tasks",
        renderIndexSection("tasks", { dir: d.tasks, recordPath: a.status, entries: [] }).trimEnd(),
      ], h);
    case "backlog":
      return doc("Backlog", "Living.", [
        "No work items have been assessed yet.",
        "| ID | Requested outcome | State | Evidence or next step |\n|---|---|---|---|",
        `Give each item a stable ID and link its task and decisions. Move a completed item to ${code(a.backlogArchive)} with its closure date and evidence.`,
      ], h);
    case "backlogArchive":
      return doc("Completed backlog", `Reference. Current work is in ${code(a.backlog)}.`, [
        "No completed items have been recorded. Keep each item's ID, outcome, closure date and evidence.",
      ], h);
    case "roadmap":
      return doc("Roadmap", "Living.", [
        "No milestones have been agreed yet.",
        "| Milestone | Intended outcome | Backlog IDs | State |\n|---|---|---|---|",
        "Record only agreed priorities. Do not invent dates or commitments.",
      ], h);
    case "decisions":
      return doc("Decisions", "Living.", [
        `Each decision is one file in ${code(`${d.decisions}/`)}, created with ${code('skilliton record decision "<title>"')}. It says what was decided, why, the alternatives rejected, the risk, how reversible it is, and the evidence. A decision recorded on a branch that is not an integration branch (${branchList(project)}) stays proposed until it is accepted there.`,
        "## Index",
        renderIndexSection("decisions", { dir: d.decisions, recordPath: a.decisions, entries: [] }).trimEnd(),
      ], h);
    case "lessons":
      return doc("Lessons", "Living.", [
        `Each lesson is one file in ${code(`${d.lessons}/`)}, created with ${code('skilliton record lesson "<title>"')}: what broke, the mechanism, the fix, the rule, and what now enforces it. When nothing enforces it yet, the entry says so.`,
        "## Index",
        renderIndexSection("lessons", { dir: d.lessons, recordPath: a.lessons, entries: [] }).trimEnd(),
      ], h);
    case "handoff":
      return doc("Handoff", "Living.", [
        "## RESUME HERE",
        `Written: ${HANDOFF_PLACEHOLDER}`,
        [
          "- **State:** Skilliton created this project's records; the project's actual state has not been assessed.",
          "- **Next:** Establish the current task and the project's real setup and test commands.",
          "- **Blocked:** Not yet assessed.",
          "- **Watch out:** Security evidence starts missing. Preparation does not show that the application works.",
        ].join("\n"),
        "## Earlier",
      ], h);
    case "handoffArchive":
      return doc("Handoff archive", `Reference. The current handoff is ${code(a.handoff)}.`, [
        "No earlier handoffs have been archived.",
      ], h);
    case "maintain":
      return doc("Repository maintenance", "Living.", [
        "This repository's own maintenance steps have not been assessed yet; add them here.",
        `When maintaining, reconcile ${[a.status, a.backlog, a.roadmap, a.decisions, a.lessons].map(code).join(", ")} and ${code(a.handoff)} against the conversation and the repository's evidence, and keep facts that are already correct. Record decisions when they are made, not only at the end of a session.`,
        `Shared records and indexes are written on an integration branch (${branchList(project)}); on any other branch, work is recorded in its task record in ${code(`${d.tasks}/`)}. Run ${code("skilliton security status")} and report every missing, stale or invalid observation as a gap, never as a pass. Never copy secrets or private records into these files.`,
      ], h);
    default:
      throw new Error(`no record template for the role "${role}"`);
  }
}

// ---------- entry folders ----------

const indent = (lines) => lines.map((l) => (l ? `    ${l}` : "")).join("\n");
const ID_SHAPE = "`YYYY-MM-DD-<slug>-<four hex digits>` (the local date, up to 40 lowercase letters, digits and hyphens from the title, and a random suffix)";

export function entryFolderReadme(kind, project) {
  const a = project.artifacts, d = project.directories;
  if (kind === "tasks") {
    return doc("Task records", "Living.", [
      `One file per task, named ${code("<id>.md")} with an ID shaped ${ID_SHAPE}. Contributors on different branches never allocate the same sequential number, so they do not overwrite each other's records. Start one with ${code('skilliton task start "<title>"')}.`,
      "A task record has this shape:",
      indent([
        "# Task: <title>",
        "",
        formatRecordHeader(project.recordHeader, "Living. Task record."),
        "",
        "- **ID:** <id>",
        `- **State:** ${TASK_STATES.join(" | ")}`,
        "- **Branch:** <branch>",
        "- **Owner:** <label, not an authenticated identity>",
        "- **Updated:** <ISO date and time>",
        "",
        "## Request",
        "## Acceptance criteria",
        "- [ ] <criterion>",
        "## Decisions",
        "## Checkpoints",
        "### <ISO date and time>",
        "- **State:** ...  - **Evidence:** ...  - **Next:** ...  - **Git:** <branch> @ <short head>, <n> uncommitted",
        "## Handoff",
        "- **State:** ...",
        "- **Next:** ...",
        "- **Blocked:** ...",
        "- **Watch out:** ...",
      ]),
      `Keep local completion (done-local) separate from merged, released and verified. On a branch that is not an integration branch (${branchList(project)}), a task's handoff goes in its own ${code("## Handoff")} section, not in ${code(a.handoff)}. ${code("skilliton index")} lists open tasks in ${code(a.status)}.`,
    ], project.recordHeader);
  }
  const decision = kind === "decisions";
  const sections = decision
    ? ["## Decision", "## Why", "## Alternatives rejected", "## Risk", "## Reversibility", "## Evidence"]
    : ["## What broke", "## The mechanism", "## The fix", "## The rule", "## What now enforces it"];
  const noun = decision ? "decision" : "lesson";
  return doc(decision ? "Decision entries" : "Lesson entries", "Living.", [
    `One file per ${noun}, named ${code("<id>.md")} with an ID shaped ${ID_SHAPE}. Create one with ${code(`skilliton record ${noun} "<title>"`)}; it shows the entry first and writes it with ${code("--apply")}. The status is ${code("proposed")} on a branch that is not an integration branch (${branchList(project)}), otherwise ${code("accepted")}.`,
    "An entry has this shape:",
    indent([`# <title>`, "", formatRecordHeader(project.recordHeader, `Living. ${decision ? "Decision" : "Lesson"} entry.`), "", "- **ID:** <id>", "- **Status:** proposed | accepted", "- **Date:** YYYY-MM-DD", "", ...sections]),
    `Write each section in plain language${decision ? "" : "; when nothing enforces the rule yet, say so"}. ${code("skilliton index")} lists every entry in ${code(decision ? a.decisions : a.lessons)}, sorted by ID; edit the entries, not the generated list.`,
  ], project.recordHeader);
}

// A new decision or lesson entry (docs/CONTRACTS.md section 11): every section says "not yet written". header is the
// creating project's prepare.recordHeader (createEntry in records.mjs passes project.recordHeader); the default
// applies where no project is in hand.
export function entryTemplate(kind, { title, id, status, date, header = DEFAULTS.recordHeader }) {
  const decision = kind === "decision";
  const sections = decision
    ? ["Decision", "Why", "Alternatives rejected", "Risk", "Reversibility", "Evidence"]
    : ["What broke", "The mechanism", "The fix", "The rule", "What now enforces it"];
  return doc(title, `Living. ${decision ? "Decision" : "Lesson"} entry.`, [
    [`- **ID:** ${id}`, `- **Status:** ${status}`, `- **Date:** ${date}`].join("\n"),
    ...sections.map((s) => `## ${s}\n\nnot yet written`),
  ], header);
}

// ---------- security register ----------

// project is optional so a caller with no project in hand (there is none today) still gets the default header;
// prepare and migrations pass the project being prepared or checked.
export function securityReadme(project = null) {
  return doc("Security evidence", "Living.", [
    `This project keeps a security evidence register in ${code(".skilliton/security/")}: ${code("catalog.json")} lists the practices assessed here, ${code("records/")} holds one immutable observation per assessment, and ${code("REPORT.md")} is generated from them.`,
    `To see where the evidence stands, run ${code("skilliton security status")} (the command comes from the installed workflow plugin; in a company skills repository checkout it is ${code("node scripts/skilliton.mjs security status")}). Missing evidence is the normal state right after preparation. It needs follow-up and is never a security pass.`,
    "An observation records a scoped claim together with fingerprints of the files it names. Status reports each control as current, stale, missing or invalid. A current observation is not a control pass, a certification or a penetration test, and regenerating the report never re-dates an observation.",
    `Catalogs shipped with Skilliton are partial sets of original practice summaries with related references to public frameworks; they are not complete framework assessments. ${code("catalogVersion")} in ${code("catalog.json")} names the version in use, and a newer catalog reaches this project only through a migration.`,
    `Keep sensitive assessment artifacts in the ignored ${code(".skilliton/private-evidence/")} folder or an approved evidence store. Never record credentials or customer data. An artifact that is missing on another machine stays missing; it is never replaced by an assumed pass.`,
  ], project?.recordHeader);
}

export function recordsReadme(project = null) {
  return doc("Observation records", "Living.", [
    `${code("skilliton security record")} writes one JSON file per observation here, named by a random UUID. Records are immutable: do not edit an earlier observation to make it current; reassess and record a new one. Review each record before committing it, and keep raw evidence in ${code(".skilliton/private-evidence/")} or an approved private store. ${code("skilliton security status")} reads this folder.`,
  ], project?.recordHeader);
}

// ---------- .gitignore ----------

// The two lines the prototype added, with the same comment, so a layout-1 project already has them. Existing bytes
// are kept; the lines are appended after a blank line.
export function gitignoreWithSkilliton(text) {
  const present = text.split(/\r?\n/);
  const needed = GITIGNORE_LINES.filter((line) => !present.includes(line));
  if (!needed.length) return text;
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lead = text === "" ? "" : (text.endsWith("\n") ? "" : eol) + eol;
  return text + lead + [GITIGNORE_COMMENT, ...needed].join(eol) + eol;
}
