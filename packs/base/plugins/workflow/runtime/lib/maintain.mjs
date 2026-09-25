// lib/maintain.mjs: the mechanical half of maintenance as one command, and the rule that says when maintenance is due.
//
// Maintenance has two halves. One is judgment: sweeping a conversation for decisions and lessons that live only in
// the chat, reconciling status and backlog prose with what merged, writing the handoff. That half is the maintain
// skill's, and only the assistant can do it. The other half is mechanical and was being done by hand inside the
// skill: regenerate the indexes, refresh the collector-backed security records that are missing or stale (never the
// tests collector: see runMaintain), refresh the security findings block, and say when maintenance last happened.
// This module does the mechanical half in one call (`skilliton maintain --apply`), writes a `maintain` event to the
// journal, and gives the stop hook the rule for when the next one is due, so that nobody has to remember to run it
// (the owner's decision, 2026-09-22: the harness decides the procedure, not the person).
//
// When is maintenance due? Measured from the last `maintain` event, or from the journal's first session start when
// there has never been one: a merge commit landed since, DUE_AFTER_COMMITS commits landed since, or a day has passed
// and at least one commit landed since. A checkpoint never writes that event, so no checkpoint quiets this. Also, whatever the journal says, when the shared handoff is HANDOFF_BEHIND_COMMITS or more commits behind HEAD: a
// session that commits straight to main makes no merge commit, and in a client repository 41 such commits in one
// evening never made maintenance due, while a mechanical `maintain --apply` had reset the clock without the judgment
// half (reported 2026-09-22). Only committing a handoff clears that one.
// A working tree that changed with no commit is the checkpoint reminder's business, not this one's.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { GitError, appendEvent, mergesSince, runGit } from "./journal.mjs";
import { regenerateIndexes } from "./records.mjs";
import { Refused, selfCommand } from "./core.mjs";
import { ledgerStep } from "./usage-ledger.mjs";
import { ComplianceRefusal, SCOPE_REL, readScope } from "./compliance-scope.mjs";

const DUE_AFTER_HOURS = 24;
export const DUE_AFTER_COMMITS = 15;
export const HANDOFF_BEHIND_COMMITS = 15;
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

// Commits since the handoff file was last committed, or null when it never was or git could not say.
function commitsBehindHandoff(root, rel) {
  if (!rel) return null;
  try {
    const last = runGit(root, ["log", "-1", "--format=%H", "HEAD", "--", rel]);
    return last.status === 0 && last.stdout.trim() ? commitsSince(root, last.stdout.trim()) : null;
  } catch (e) {
    if (e instanceof GitError) return null;
    throw e;
  }
}

// { due, why, baseline: { kind, at, head } | null }: the stop hook's rule. `events` is the journal, oldest first;
// `handoff` is the shared handoff's repository-relative path.
export function evaluateMaintain({ root, events, now, integration, handoff = null }) {
  if (!integration) return { due: false, why: "not an integration branch, where the shared records are written", baseline: null };
  const behind = commitsBehindHandoff(root, handoff);
  const handoffDue = behind !== null && behind >= HANDOFF_BEHIND_COMMITS
    ? { due: true, why: `the shared handoff (${handoff}) is ${behind} commits behind HEAD, the limit is ${HANDOFF_BEHIND_COMMITS}, and only committing a new handoff clears this`, baseline: null, handoffBehind: behind }
    : null;
  const last = [...events].reverse().find((e) => e.event === "maintain") ?? null;
  const first = events.find((e) => e.event === "session-start") ?? null;
  const baseline = last ? { kind: "maintain", at: last.at, head: last.head ?? null } : first ? { kind: "session-start", at: first.at, head: first.head ?? null } : null;
  if (!baseline) return handoffDue ?? { due: false, why: "no maintenance and no session start recorded, so there is nothing to measure from", baseline };
  if (!baseline.head) return handoffDue ?? { due: false, why: "the baseline event recorded no commit id", baseline };
  const merges = mergesSince(root, baseline.head);
  if (merges.merges.length) return { due: true, why: `${merges.merges.length} merge commit(s) landed (${merges.merges.map((m) => m.shortSha).join(", ")})`, baseline, merges };
  const landed = commitsSince(root, baseline.head);
  if (landed !== null && landed >= DUE_AFTER_COMMITS) return { due: true, why: `${landed} commits landed (the limit is ${DUE_AFTER_COMMITS})`, baseline, merges };
  if (handoffDue) return { ...handoffDue, baseline };
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
  const since = decision.handoffBehind !== undefined ? null : decision.baseline.kind === "maintain" ? "the last maintenance" : "this project's first recorded session (no `skilliton maintain` run is in this repository's journal; a maintenance done without it is not seen)";
  return [
    `Skilliton maintenance is due: ${decision.why}${since ? ` since ${since}` : ""}.`,
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

  // The usage ledger's batch row ends at this maintenance's own time, which the journal event below records, so the
  // next row starts exactly there. It is written before the collectors run, so the secrets record they write has
  // already seen it.
  const at = new Date().toISOString();
  steps.push(ledgerStep(project, { root, apply, at }));

  const wroteSince = (from, name) => steps.slice(from).some((st) => st.status === "wrote" && st.name.startsWith(name));
  let mark = steps.length;
  await refreshCollectors(root, { apply, steps });
  const collected = wroteSince(mark, "security collect ");
  mark = steps.length;
  await findingsStep(root, { apply, steps });
  // The secrets collector fingerprints every tracked file, the backlog included, so the findings rewrite just after it
  // leaves the record it wrote stale (B81). Collect once more and write the findings again, so one run settles.
  if (collected && wroteSince(mark, "security findings")) {
    await refreshCollectors(root, { apply, steps, again: true });
    await findingsStep(root, { apply, steps });
  }
  await complianceSheetStep(root, { apply, steps });

  let wrote = false;
  if (apply) {
    appendEvent(root, { event: "maintain", session, at });
    steps.push({ name: "journal", status: "wrote", detail: "maintain event recorded; the stop hook measures the next one from here" });
    wrote = true;
  } else {
    steps.push({ name: "journal", status: "would write", detail: "a maintain event, which the stop hook measures the next one from" });
  }
  return { integration: true, branch: indexes.branch, steps, wrote };
}

  // Refresh the collector-backed records that are missing or stale, one control at a time, never the tests
  // collector (it runs the project's own checks, which can take long and belong to the gate, not maintenance).
  // A control the security evidence has decided does not apply, or that is not in this project's catalog, is left
  // alone; so is one that is already current. A collector that throws is reported as not run, never as success, and
  // never stops the rest of maintenance (matching how the security findings step below handles its own failures).
async function refreshCollectors(root, { apply, steps, again = false }) {
  if (!existsSync(join(root, CATALOG_REL))) return;
  try {
    const { evaluateSecurity } = await import("./security.mjs");
    const { collectSecrets, collectDeliveryPolicy, DELIVERY_REL } = await import("./collectors.mjs");
    const ev = evaluateSecurity(root);
    if (ev.result === "invalid") {
      const detail = "the security evidence is invalid (see security status); collectors were not run";
      steps.push({ name: "security collectors", status: "not run", detail });
    } else {
      const rowFor = (id) => ev.rows.find((row) => row.control.id === id) ?? null;
      const deliveryPolicyExists = existsSync(join(root, DELIVERY_REL));
      const REVIEWER = "skilliton maintain";
      // gate: a reason the collector must not run even though its record is missing or stale (the delivery-policy
      // collector needs the policy file to exist; the secrets collector has no such precondition).
      const refresh = (controlId, name, collect, gate = null) => {
        const row = rowFor(controlId);
        if (!row || row.applies === "no") return;
        const due = row.freshness === "missing" || row.freshness === "stale";
        const onlyDue = row.freshness === "expired" ? " (maintain refreshes missing or stale records only)" : "";
        if (!due) { steps.push({ name, status: "current", detail: `${controlId} is ${row.freshness}${onlyDue}` }); return; }
        if (gate) { steps.push({ name, status: "not run", detail: `${controlId} is ${row.freshness}, but ${gate}` }); return; }
        if (!apply) { steps.push({ name, status: "would write", detail: `${controlId} is ${row.freshness}` }); return; }
        try {
          const result = collect();
          const why = again ? " again, because the findings rewrite changed a file the first collection read" : "";
          steps.push({ name, status: "wrote", detail: `recorded ${result.record.assessment} for ${controlId}${why}` });
        } catch (e) {
          steps.push({ name, status: "not run", detail: `${e?.message ?? String(e)}${e?.detail ? `. ${e.detail}` : ""}` });
        }
      };
      refresh("SG-SECRETS-IN-SOURCE", "security collect secrets", () => collectSecrets(root, { reviewer: REVIEWER, apply: true }));
      refresh("SG-CHECK-CRITERIA", "security collect delivery-policy", () => collectDeliveryPolicy(root, { reviewer: REVIEWER, apply: true }),
        deliveryPolicyExists ? null : `${DELIVERY_REL} does not exist`);
    }
  } catch (e) {
    steps.push({ name: "security collectors", status: "not run", detail: e?.message ?? String(e) });
  }
}

// The security findings file and its one-line link in the backlog, from the register as it stands after the collectors ran.
async function findingsStep(root, { apply, steps }) {
  if (existsSync(join(root, CATALOG_REL))) {
    try {
      const { planFindings, writeFindings } = await import("./security.mjs");
      const plan = planFindings(root);
      const same = !plan.changed;
      if (!same && apply) writeFindings(root, plan);
      steps.push({ name: "security findings", status: same ? "current" : apply ? "wrote" : "would write", detail: `${plan.findings.length} open finding(s) in ${plan.rel}` });
    } catch (e) {
      steps.push({ name: "security findings", status: "not run", detail: e?.message ?? String(e) });
    }
  } else {
    steps.push({ name: "security findings", status: "not run", detail: `no security register at ${CATALOG_REL}` });
  }
}

// The compliance sheet, from the confirmed scope as it stands: writeSheet(root, { apply }) (lib/compliance-sheet.mjs).
// Nothing runs before a scope is confirmed; an unusable scope or proposal file, or a write that fails, is reported
// as not run, never as success.
async function complianceSheetStep(root, { apply, steps }) {
  let scope;
  try { scope = readScope(root); } catch (e) {
    if (!(e instanceof ComplianceRefusal)) throw e;
    steps.push({ name: "compliance sheet", status: "not run", detail: e.message });
    return;
  }
  if (!scope) {
    steps.push({ name: "compliance sheet", status: "not run", detail: `no confirmed compliance scope at ${SCOPE_REL}` });
    return;
  }
  try {
    // Loaded dynamically, not statically at the top of this file, for the same reason as project-files.mjs's
    // complianceCheck: compliance-sheet.mjs statically imports evaluateSecurity from security.mjs, and a static
    // import chain down to it would fail this whole module (every maintain step, not just this one) the moment
    // security.mjs is a build that lacks that export, rather than reporting this one step as not run.
    const { writeSheet } = await import("./compliance-sheet.mjs");
    const result = writeSheet(root, { apply });
    const status = result.due ? (apply ? "wrote" : "would write") : "current";
    const detail = result.due ? `${result.changedRows} row(s) changed` : "current";
    steps.push({ name: "compliance sheet", status, detail });
  } catch (e) {
    steps.push({ name: "compliance sheet", status: "not run", detail: e?.message ?? String(e) });
  }
}
