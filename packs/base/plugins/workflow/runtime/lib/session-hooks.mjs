// session-hooks.mjs: what the three lifecycle hooks decide and print. docs/CONTRACTS.md sections 9 and 11.
//
// commands/hook.mjs is the only caller. The parts are here rather than in lifecycle.mjs because they answer a
// different question: lifecycle.mjs gathers what is true about a project, and this file turns that into the one block
// a session start prints and the one reason a Stop reminder gives. Keeping them apart also keeps lifecycle.mjs under
// the runtime's size ceiling, which is what forced the split.
//
// Nothing here reads the disk or runs a program: every input arrives as a value, so each rule can be tested by calling
// it. The Git reads a rule needs, such as the merge check behind the maintenance sentence, are done by the caller.
// One exception, kept in its own module and replaceable by an option: the session-start block's skill copy lines
// (lib/skill-drift.mjs) read the project's .claude/skills/ folder and the installed plugins' skills.

import { selfCommand } from "./core.mjs";
import { legacyEnvironment } from "./legacy-names.mjs";
import { clip } from "./lifecycle.mjs";
import { skillCopyLines } from "./skill-drift.mjs";
import { gitLine } from "./tasks.mjs";

// ---------- the Stop reminder rule ----------

const findLast = (list, test) => { for (let i = list.length - 1; i >= 0; i--) if (test(list[i])) return list[i]; return null; };

// The rule, exactly: block only when checkpoints.stopReminder is on; stop_hook_active is not true; the working tree
// fingerprint differs from the last checkpoint event's (or, with no checkpoint, from this session's start); at least
// checkpoints.minMinutes passed since that checkpoint (or since this session started when there is none); and no
// stop-reminded event exists for this fingerprint. Returns { block, why, ... }.
//
// A clean working tree (no porcelain lines) never gets the reminder, even when HEAD moved: the fingerprint is HEAD
// plus porcelain, so committing a checkpoint's own records changed it, and the next stop was held on a tree `git status`
// showed empty (measured 2026-09-22). Those commits carry their own messages, and a merge among them is the
// maintenance reminder's to raise, which it does on its own. A dirty tree is judged exactly as before.
export function evaluateStop({ stopHookActive, checkpoints, state, events, session, now }) {
  if (stopHookActive === true) return { block: false, why: "stop_hook_active is true" };
  if (!checkpoints.stopReminder) return { block: false, why: "checkpoints.stopReminder is off" };
  if (!state.fingerprint) return { block: false, why: "the working tree fingerprint could not be read" };
  const lastCheckpoint = findLast(events, (e) => e.event === "checkpoint");
  // This session's first start (a resume or compaction records another start with the same ID, which must not reset
  // the baseline). Measure from whichever is later, this session's start or the last checkpoint, so changes made
  // before this session began (a commit in a terminal, another session's work) never trigger a reminder here.
  const sessionStart = events.find((e) => e.event === "session-start" && (e.session ?? null) === session) ?? null;
  const baseline = lastCheckpoint && sessionStart ? (Date.parse(sessionStart.at) > Date.parse(lastCheckpoint.at) ? sessionStart : lastCheckpoint) : (lastCheckpoint ?? sessionStart);
  const fromCheckpoint = baseline !== null && baseline === lastCheckpoint;
  if (!baseline) return { block: false, why: "no checkpoint and no recorded start for this session, so there is nothing to measure from" };
  if (!baseline.fingerprint) return { block: false, why: "the baseline event has no fingerprint" };
  if (baseline.fingerprint === state.fingerprint) return { block: false, why: fromCheckpoint ? "nothing changed since the last checkpoint" : "nothing changed since this session started" };
  if (state.dirty === 0) return { block: false, why: `the working tree is clean, so nothing is waiting to be recorded; the commits since the ${fromCheckpoint ? "last checkpoint" : "session started"} carry their own messages` };
  const elapsedMs = now.getTime() - Date.parse(baseline.at);
  if (elapsedMs < checkpoints.minMinutes * 60000) return { block: false, why: `less than ${checkpoints.minMinutes} minutes since the ${fromCheckpoint ? "last checkpoint" : "session started"}` };
  if (events.some((e) => e.event === "stop-reminded" && e.fingerprint === state.fingerprint)) return { block: false, why: "a reminder was already given for this working tree state" };
  return { block: true, why: "reminder due", baseline: fromCheckpoint ? "checkpoint" : "session-start", baselineAt: baseline.at, baselineHead: baseline.head ?? null, elapsedMinutes: Math.floor(elapsedMs / 60000) };
}

// The Stop hook's reason: what changed, and the exact command to run next.
//
// `merges` is what mergesSince() returned for the window this reminder measures. A merge commit in that window means a
// batch of work just landed, which is the moment the harness asks for maintenance, so the reminder says so. It is one
// more sentence in an existing reminder and never a block of its own: a merge with nothing else changed does not reach
// this function, because evaluateStop decides that. A window the merge check could not read says so rather than
// reading an empty list as "no merge happened".
//
// `audit` is { result } from auditScope over the working tree, or { problem } when it could not run. A clean tree says
// nothing: a reminder that announced "no findings" every time would train everyone to skip the whole reminder, and the
// sentence would stop being read on the day it mattered. A run that failed does get a sentence, because silence there
// is indistinguishable from a clean tree.
export function stopReason({ decision, state, current, merges = null, audit = null, command = selfCommand() }) {
  const since = decision.baseline === "checkpoint"
    ? `the last checkpoint (${decision.elapsedMinutes} minutes ago)`
    : `this session started (${decision.elapsedMinutes} minutes ago), and no checkpoint has been recorded`;
  const values = `--state "<what is done and what is not>" --evidence "<checks or tests you ran, with their results>" --next "<the next concrete step>" --apply`;
  const parts = [`Skilliton checkpoint reminder: the working tree has changed since ${since}.`];
  if (current.unreadable?.length) parts.push(`${current.unreadable.length} task record(s) could not be read: ${current.unreadable.map((u) => u.file).join(", ")}.`);
  if (merges?.merges?.length) {
    const named = merges.merges.map((m) => m.shortSha).join(", ");
    const n = merges.merges.length;
    parts.push(`${n} merge commit${n === 1 ? "" : "s"} landed in that window (${named}), so a batch of work has just come in: run /workflow:maintain on an integration branch as well, which reconciles the records and the indexes against what merged.`);
  } else if (merges?.problem) {
    parts.push(`Whether a batch merged in that window is unknown: ${merges.problem}.`);
  }
  if (audit?.result?.findings.length) {
    const files = [...new Set(audit.result.findings.map((f) => f.path))];
    const named = files.slice(0, 3).join(", ");
    const more = files.length > 3 ? `, and ${files.length - 3} more` : "";
    parts.push(`The audit found ${audit.result.findings.length} finding(s) in ${files.length} of the file(s) this tree changed (${named}${more}); read each one with its line and rule by running: ${command} audit. This is a report and not a block: the shared repository's delivery gate is what refuses a push.`);
  } else if (audit?.problem) {
    parts.push(`Whether those files carry anything worth attention is unknown: the audit did not run (${audit.problem}).`);
  }
  parts.push("This reminder is given once for this working tree state; if this work should not be recorded, tell the user why and stop.");
  // The command comes last, so no punctuation follows it.
  if (current.task) {
    parts.push(`Otherwise record where task ${current.task.id} stands (each value one line) by running: ${command} checkpoint --task ${current.task.id} ${values}`);
  } else if (current.ambiguous.length) {
    parts.push(`Branch ${state.branch} has more than one open task (${current.ambiguous.join(", ")}); otherwise pick the one this work belongs to and run: ${command} checkpoint --task <id> ${values}`);
  } else {
    const where = state.branch ? `branch ${state.branch}` : "a detached HEAD";
    const branchOption = state.branch ? "" : " --branch <branch name>";
    const taskOption = state.branch ? "" : " --task <id printed by task start>";
    parts.push(`No open task record matches ${where}; otherwise start one, then record a checkpoint, by running: ${command} task start "<short title of this work>" --criteria "<what done means>"${branchOption} --apply and then: ${command} checkpoint${taskOption} ${values}`);
  }
  return parts.join(" ");
}

// ---------- hook input ----------

// The client's hook JSON. Every field is optional; a value of the wrong type is treated as missing.
export function parseHookInput(raw) {
  let value = null, problem = null;
  if (typeof raw === "string" && raw.trim()) {
    try { value = JSON.parse(raw); } catch { problem = "the hook input on stdin was not JSON"; }
  }
  const isObject = value !== null && typeof value === "object" && !Array.isArray(value);
  if (value !== null && !isObject) problem = "the hook input on stdin was not a JSON object";
  const obj = isObject ? value : {};
  const text = (v) => (typeof v === "string" && v.length > 0 && v.length <= 4096 ? v : null);
  // The prompt is whole prose, not an identifier, so it gets its own bound. Claude Code 2.1.278 sends it as `prompt`
  // (measured 2026-09-22 with a project hook that saved its own input); the hooks reference read on 2026-09-20 named
  // `user_prompt`, and this hook read only that name until then, so it never saw a real prompt. Both are accepted,
  // `prompt` first. A client that sends neither reaches the "no prompt text" path, which suggests nothing.
  const given = typeof obj.prompt === "string" && obj.prompt.length > 0 ? obj.prompt : typeof obj.user_prompt === "string" && obj.user_prompt.length > 0 ? obj.user_prompt : null;
  const prompt = given === null ? null : given.slice(0, PROMPT_MAX_CHARS);
  return {
    cwd: text(obj.cwd), session: text(obj.session_id), stopHookActive: obj.stop_hook_active === true,
    source: text(obj.source), trigger: text(obj.trigger), reason: text(obj.reason),
    prompt, promptTruncated: given !== null && given.length > PROMPT_MAX_CHARS, problem,
  };
}

// ---------- the dispatch suggestion rule ----------

const PROMPT_MAX_CHARS = 65536;

// What counts as one item, decided by the owner on 2026-09-20 (docs/decisions/, "lists and prose"): a numbered line, a
// bulleted line, and a plain instruction sentence each count as one, so the same six tasks reach six whether they are
// written as a list or as prose. A line that is a list item is never also read for sentences, so one bullet holding
// three sentences is one item and not four.
//
// The prose half needs a rule for "is this sentence a task", and this is a list of verbs, not a parser. That is a real
// limit and it is the right trade here: the hook adds a sentence of advice and can never block a prompt, so a verb it
// does not know costs one absent suggestion, while counting every sentence would suggest splitting a prompt that is
// six sentences of explanation. Six sentences of explanation is the common case; six sentences of orders is not.
const IMPERATIVES = new Set([
  "add", "build", "bump", "change", "check", "clean", "close", "convert", "create", "delete", "deploy", "disable",
  "document", "drop", "enable", "ensure", "extract", "finish", "fix", "handle", "implement", "improve", "install",
  "investigate", "make", "merge", "migrate", "move", "pin", "port", "publish", "record", "refactor", "release",
  "remove", "rename", "replace", "report", "reset", "revert", "rewrite", "run", "ship", "simplify", "sort", "split",
  "support", "swap", "switch", "test", "tidy", "trim", "unify", "update", "upgrade", "verify", "wire", "write",
]);

// Openings that carry no information about whether the sentence is an order, stripped before the first word is read.
const LEAD_INS = [
  "can you please", "could you please", "can you", "could you", "would you", "i need you to", "i want you to",
  "i would like you to", "we need to", "we should", "you should", "please", "lets", "let us", "also", "then", "next",
  "after that", "finally", "first", "second", "third", "fourth", "fifth", "lastly", "and",
];

const LIST_LINE = /^[ \t]{0,8}(?:[-*+]|\u2022|\(?\d{1,2}[.)])[ \t]+\S/;

// Sentences end at . ! ? or ; followed by whitespace or the end of the line. A line break also ends one: a prompt
// written as short lines without punctuation is still a list of orders.
const sentencesOf = (line) => line.split(/(?<=[.!?;])\s+/).map((s) => s.trim()).filter(Boolean);

function isInstruction(sentence) {
  let s = sentence.toLowerCase().replace(/^[^a-z]+/, "");
  for (let changed = true; changed;) {
    changed = false;
    for (const lead of LEAD_INS) {
      if (!s.startsWith(lead)) continue;
      const rest = s.slice(lead.length);
      if (rest && /[a-z]/.test(rest[0])) continue; // "android" is not the lead-in "and"; the lead-in ends the word
      s = rest.replace(/^[^a-z]+/, "");
      changed = true;
      break;
    }
  }
  return IMPERATIVES.has(s.split(/[^a-z]+/, 1)[0] ?? "");
}

// The count, and what it was made of, so the note can say what it read. Fenced code is skipped whole: a pasted script
// whose lines begin with "run" or "rm" is not a list of tasks the person is asking for.
export function countPromptItems(prompt) {
  const counts = { items: 0, listItems: 0, sentenceItems: 0 };
  if (typeof prompt !== "string" || !prompt) return counts;
  let fenced = false;
  for (const line of prompt.split("\n")) {
    if (/^[ \t]{0,3}(?:```|~~~)/.test(line)) { fenced = !fenced; continue; }
    if (fenced) continue;
    if (LIST_LINE.test(line)) { counts.listItems += 1; continue; }
    counts.sentenceItems += sentencesOf(line).filter(isInstruction).length;
  }
  counts.items = counts.listItems + counts.sentenceItems;
  return counts;
}

// The note the hook adds to the conversation, or null when there is nothing to suggest. It is advice with the count
// it rests on, so a wrong count can be seen and argued with rather than only felt.
export function dispatchSuggestion(counts, threshold) {
  if (counts.items < threshold) return null;
  const made = [];
  if (counts.listItems) made.push(`${counts.listItems} numbered or bulleted line${counts.listItems === 1 ? "" : "s"}`);
  if (counts.sentenceItems) made.push(`${counts.sentenceItems} instruction sentence${counts.sentenceItems === 1 ? "" : "s"}`);
  // "the dispatch threshold" and not "this project's setting": the same number is the default in a repository that
  // was never prepared, where this hook also runs, and the note should not claim a setting that nobody made.
  return `[workflow] This prompt reads as ${counts.items} separate items (${made.join(" and ")}), at or above the dispatch threshold of ${threshold} (dispatch.minItemsForLanes). `
    + "Run /workflow:dispatch first, before editing any file: it verifies each item against the code and writes the lane plan (LANES.md), with one lane when the items are small, so small chores go through it too. "
    + "If no lane plan is written in this session, the stop hook asks once more. "
    + "Skip it only when the prompt is not a list of work at all (a pasted log, a question, notes to read), and say so in one line: counting is structural and can be wrong.";
}

// The stop hook's dispatch rule: the last dispatch suggestion of this session is due when no lane plan was written
// after it (laneFileMtimeMs is the plan file's modification time, or null when there is none) and it has not been
// asked about once already. { due, suggestion, planned?, asked? }.
export function evaluateDispatchHold({ events, session, laneFileMtimeMs }) {
  if (!session) return { due: false, suggestion: null };
  const suggestion = [...events].reverse().find((e) => e.event === "dispatch-suggested" && e.session === session) ?? null;
  if (!suggestion) return { due: false, suggestion };
  const at = Date.parse(suggestion.at);
  if (!Number.isFinite(at)) return { due: false, suggestion };
  if (laneFileMtimeMs !== null && laneFileMtimeMs >= at) return { due: false, suggestion, planned: true };
  if (events.some((e) => e.event === "dispatch-reminded" && e.session === session && e.suggestedAt === suggestion.at)) return { due: false, suggestion, asked: true };
  return { due: true, suggestion };
}

export function dispatchHoldReason(hold, { laneFile, laneFileExists }) {
  const n = hold.suggestion.items;
  return [
    `Skilliton dispatch was named for a prompt in this session that read as ${typeof n === "number" ? `${n} separate items` : "several separate items"}, and no lane plan has been written since (${laneFile} at the repository root ${laneFileExists ? "is older than that prompt" : "does not exist"}).`,
    "Before finishing, run /workflow:dispatch: it verifies each item against the code and writes the lane plan, with one lane when the items are small, and it is the record of what was asked and checked even when the work is already done.",
    "Skip it only if that prompt was not a list of work at all, and then tell the user so in one line and stop. This is asked once for that prompt.",
  ].join(" ");
}

// ---------- the session-start block ----------

// Whole lines, at most maxBytes bytes in total including the truncation notice.
function boundLines(lines, maxBytes, notice) {
  const text = lines.map((line) => `${line}\n`).join("");
  if (Buffer.byteLength(text) <= maxBytes) return { text, truncated: false };
  const tail = `${notice}\n`;
  let budget = maxBytes - Buffer.byteLength(tail);
  let out = "";
  for (const line of lines) {
    const size = Buffer.byteLength(`${line}\n`);
    if (size > budget) break;
    out += `${line}\n`;
    budget -= size;
  }
  return { text: `${out}${tail}`, truncated: true };
}

const BLOCK_LABELS = { layout: "Layout", migrations: "Pending migrations", versions: "Versions", records: "Records", handoff: "Shared handoff", sessions: "Previous session", security: "Security" };
const WORDS = { attention: "needs attention", "not-run": "not run", failed: "failed" };

function taskLines(report, check) {
  const word = WORDS[check.status];
  const current = report.current;
  if (!current) return [`- Current task${word ? ` (${word})` : ""}: ${check.summary}`];
  const lines = [];
  const branch = report.git.branch;
  if (current.task) {
    const t = current.task, c = t.lastCheckpoint;
    const last = c ? `last checkpoint ${clip(c.at, 40)}: State: ${clip(c.state, 160)}; Evidence: ${clip(c.evidence, 160)}; Next: ${clip(c.next, 160)}` : "no checkpoint recorded yet";
    lines.push(`- Current task: ${t.id} "${clip(t.title, 100)}" (${t.state}, ${t.checkpoints} checkpoint(s)); ${last}`);
    const h = t.handoff;
    lines.push(`- Task handoff: ${h ? `State: ${clip(h.state, 160)}; Next: ${clip(h.next, 160)}; Blocked: ${clip(h.blocked, 120)}; Watch out: ${clip(h.watchOut, 120)}` : "not yet written"}`);
  } else if (current.ambiguous.length) {
    lines.push(`- Current task (needs attention): ambiguous, ${current.ambiguous.length} open tasks on branch ${branch}: ${current.ambiguous.join(", ")}; a checkpoint needs --task <id>`);
  } else {
    lines.push(`- Current task: none (${branch ? `no open task on branch ${branch}` : "HEAD is detached"}); to start one: ${selfCommand()} task start "<title>" --apply`);
  }
  if (current.unreadable.length) lines.push(`- Task records (needs attention): ${current.unreadable.length} unreadable: ${current.unreadable.map((u) => clip(u.message, 160)).join("; ")}`);
  return lines;
}

const prepareOffer = () => `offer it in plain words before other work: "This project is not set up for Skilliton yet. Setting it up adds records for status, backlog, decisions, lessons and handoffs, a managed instruction block in CLAUDE.md and AGENTS.md, and a security register; it keeps any of those that already exist. Nothing is written until you say yes." On a yes, in this order: ${selfCommand()} prepare shows the change; ${selfCommand()} prepare --apply shows it again and writes it, drafting dispatch.laneTestCommand, laneRoot and hotspots and a delivery policy draft from what the repository shows; then turn the user's first request into the first task with two to six proposed criteria: ${selfCommand()} task start "<title>" --request "<the user's words>" --criteria "<criterion>" --apply`;

// What a resuming session needs first comes first, because truncation keeps the top of the block.
const BLOCK_ORDER = ["tasks", "sessions", "handoff", "layout", "migrations", "versions", "records", "security"];

// These four collapse into one "- Checks: ... ok" line when every one of them is ok and has nothing to act on: a
// clean run then costs one line instead of four repeating "ok" for lines nobody needed to read. Any of the four that
// is not ok keeps its own line, in its usual place, exactly as before; only the ok ones are named in the combined
// line. sessions, handoff and security are not in this set: they carry a summary worth reading even when ok (who was
// here, when the handoff was written, how many controls apply).
const COLLAPSIBLE = ["layout", "migrations", "versions", "records"];

// skillCopies: the lines lib/skill-drift.mjs gives for this project (a copy under .claude/skills/ that differs from the
// installed plugin's skill of the same name), read from report.root unless given; none when nothing differs.
export function sessionStartBlock(report, { maxBytes, notes = [], skipOffer = false, skillCopies = skillCopyLines(report.root) }) {
  const lines = ["[workflow] Project state (skilliton hook session-start):", `- Branch: ${gitLine(report.git)}`];
  if (report.configProblem) lines.push(`- Configuration (needs attention): ${clip(report.configProblem, 300)}`);
  const renamed = legacyEnvironment();
  if (renamed.length) lines.push(`- Environment (needs attention): ${renamed.map((v) => `${v.name} is set but no longer read; the variable is now ${v.replacement}`).join("; ")}`);
  for (const note of [...notes, ...skillCopies]) lines.push(`- ${clip(note, 300)}`);
  let collapsibleDone = false;
  for (const name of BLOCK_ORDER) {
    if (COLLAPSIBLE.includes(name)) {
      if (collapsibleDone) continue;
      collapsibleDone = true;
      const ok = [];
      for (const name2 of COLLAPSIBLE) {
        const check2 = report.checks.find((c) => c.name === name2);
        if (!check2) continue;
        if (check2.status === "ok") { ok.push(name2); continue; }
        const word2 = WORDS[check2.status];
        lines.push(`- ${BLOCK_LABELS[name2]}${word2 ? ` (${word2})` : ""}: ${clip(check2.summary, 600)}`);
        // A never-prepared repository has no managed block to instruct the assistant, so the offer is made here, in
        // plain words, with the commands a yes runs (PLAN.md M8, first increment).
        // A project whose files were removed by hand gets the layout line's restore command instead of this offer,
        // and a repository the person kept out on purpose (skipOffer, lib/auto-prepare.mjs) is not offered either.
        if (name2 === "layout" && report.data?.layout?.version === null && !report.data.layout.removed && !skipOffer) lines.push(`- Not prepared (needs attention): ${prepareOffer()}`);
      }
      if (ok.length) lines.push(`- Checks: ${ok.join(", ")} ok`);
      continue;
    }
    const check = report.checks.find((c) => c.name === name);
    if (!check) continue;
    if (name === "tasks") { lines.push(...taskLines(report, check)); continue; }
    const word = WORDS[check.status];
    lines.push(`- ${BLOCK_LABELS[name]}${word ? ` (${word})` : ""}: ${clip(check.summary, 600)}`);
  }
  return boundLines(lines, maxBytes, `[workflow] Project state truncated at ${maxBytes} bytes; for all of it run: ${selfCommand()} status`);
}
