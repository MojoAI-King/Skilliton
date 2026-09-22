// lib/maintain.mjs: the mechanical half of maintenance as one command, and the rule that says when maintenance is due.
//
// Maintenance has two halves. One is judgment: sweeping a conversation for decisions and lessons that live only in
// the chat, reconciling status and backlog prose with what merged, writing the handoff. That half is the maintain
// skill's, and only the assistant can do it. The other half is mechanical and was being done by hand inside the
// skill: regenerate the indexes, refresh the security findings block, and say when maintenance last happened. This
// module does the mechanical half in one call (`skilliton maintain --apply`), writes a `maintain` event to the
// journal, and gives the stop hook the rule for when the next one is due, so that nobody has to remember to run it
// (the owner's decision, 2026-09-22: the harness decides the procedure, not the person).
//
// When is maintenance due? Measured from the last `maintain` event, or from the journal's first session start when
// there has never been one: a merge commit landed since, or a day has passed and at least one commit landed since.
// A working tree that changed with no commit is the checkpoint reminder's business, not this one's.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { GitError, appendEvent, mergesSince, runGit } from "./journal.mjs";
import { regenerateIndexes } from "./records.mjs";
import { Refused, selfCommand } from "./core.mjs";

const DUE_AFTER_HOURS = 24;
const CATALOG_REL = ".skilliton/security/catalog.json";

// Commits reachable from HEAD and not from baseHead, or null when git could not say.
function commitsSince(root, baseHead) {
  if (!baseHead) return null;
  try {
    const r = runGit(root, ["rev-list", "--count", `${baseHead}..HEAD`]);
    return r.status === 0 ? Number(r.stdout.trim()) : null;
  } catch (e) {
    if (e instanceof GitError) return null;
    throw e;
  }
}

// { due, why, baseline: { kind, at, head } | null }: the stop hook's rule. `events` is the journal, oldest first.
export function evaluateMaintain({ root, events, now, integration }) {
  if (!integration) return { due: false, why: "not an integration branch, where the shared records are written", baseline: null };
  const last = [...events].reverse().find((e) => e.event === "maintain") ?? null;
  const first = events.find((e) => e.event === "session-start") ?? null;
  const baseline = last ? { kind: "maintain", at: last.at, head: last.head ?? null } : first ? { kind: "session-start", at: first.at, head: first.head ?? null } : null;
  if (!baseline) return { due: false, why: "no maintenance and no session start recorded, so there is nothing to measure from", baseline };
  if (!baseline.head) return { due: false, why: "the baseline event recorded no commit id", baseline };
  const merges = mergesSince(root, baseline.head);
  if (merges.merges.length) return { due: true, why: `${merges.merges.length} merge commit(s) landed (${merges.merges.map((m) => m.shortSha).join(", ")})`, baseline, merges };
  const hours = (now.getTime() - Date.parse(baseline.at)) / 3600000;
  if (hours >= DUE_AFTER_HOURS) {
    const commits = commitsSince(root, baseline.head);
    if (commits === null) return { due: false, why: "the commit count since the baseline could not be read", baseline };
    if (commits > 0) return { due: true, why: `${Math.floor(hours)} hours and ${commits} commit(s) have passed`, baseline, merges };
    return { due: false, why: `${Math.floor(hours)} hours passed with no commit`, baseline };
  }
  return { due: false, why: merges.problem ? `no merge could be read (${merges.problem}) and less than ${DUE_AFTER_HOURS} hours passed` : `no merge landed and less than ${DUE_AFTER_HOURS} hours passed`, baseline };
}

// The stop hook's paragraph. The command comes first, the judgment steps after it, and the once-per rule last.
export function maintainReason(decision, { command = selfCommand() } = {}) {
  const since = decision.baseline.kind === "maintain" ? "the last maintenance" : "this project's first recorded session (no maintenance has been recorded yet)";
  return [
    `Skilliton maintenance is due: ${decision.why} since ${since}.`,
    `Before finishing, run: ${command} maintain --apply (it regenerates the indexes, refreshes the security findings and records the maintenance; nothing a person has to read).`,
    "Then the part only you can do: sweep this conversation for decisions and lessons that are not yet entry files and record them (record decision or record lesson, then fill the file); reconcile the status record and the backlog with what merged; write the handoff with checkpoint --handoff. /workflow:maintain has the full steps.",
    "This is asked once for this commit; if maintenance should not run now, tell the user why and stop.",
  ].join(" ");
}

// The mechanical half. Returns { integration, branch, steps, wrote } with one step per action:
// { name, status: "current" | "would write" | "wrote" | "not run" | "refused", detail }.
export async function runMaintain(project, { root, gitDir, apply = false, session = null }) {
  const steps = [];
  let indexes;
  try {
    indexes = regenerateIndexes(project, { apply, gitDir });
  } catch (e) {
    if (!(e instanceof Refused)) throw e;
    return { integration: false, branch: null, steps: [{ name: "indexes", status: "refused", detail: e.message }], wrote: false, refused: e.message };
  }
  if (!indexes.integration) {
    return { integration: false, branch: indexes.branch, steps: [], wrote: false, refused: `maintenance writes the shared records, which are written on an integration branch (${project.integrationBranches.join(", ")}) only; this is ${indexes.branch === null ? "a detached HEAD" : `branch ${indexes.branch}`}. Nothing was written` };
  }
  const changed = indexes.sections.filter((s) => s.changed);
  steps.push({
    name: "indexes",
    status: !changed.length ? "current" : apply ? "wrote" : "would write",
    detail: !changed.length ? `${indexes.sections.map((s) => s.kind).join(", ")} indexes current` : `${changed.map((s) => `${s.kind} index in ${s.record}`).join(", ")}`,
  });
  for (const p of indexes.problems) steps.push({ name: "indexes", status: "not run", detail: p });

  if (existsSync(join(root, CATALOG_REL))) {
    try {
      const { planFindings, writeFindings } = await import("./security.mjs");
      const plan = planFindings(root);
      const same = plan.before === plan.after;
      if (!same && apply) writeFindings(root, plan);
      steps.push({ name: "security findings", status: same ? "current" : apply ? "wrote" : "would write", detail: `${plan.findings.length} open finding(s) in ${plan.rel}` });
    } catch (e) {
      steps.push({ name: "security findings", status: "not run", detail: e?.message ?? String(e) });
    }
  } else {
    steps.push({ name: "security findings", status: "not run", detail: `no security register at ${CATALOG_REL}` });
  }

  let wrote = false;
  if (apply) {
    appendEvent(root, { event: "maintain", session, at: new Date().toISOString() });
    steps.push({ name: "journal", status: "wrote", detail: "maintain event recorded; the stop hook measures the next one from here" });
    wrote = true;
  } else {
    steps.push({ name: "journal", status: "would write", detail: "a maintain event, which the stop hook measures the next one from" });
  }
  return { integration: true, branch: indexes.branch, steps, wrote };
}
