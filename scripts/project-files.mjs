// Project scaffolding contains original summaries and references, not framework text.
export const version = 1;
export const candidates = {
  status: ['docs/STATUS.md', 'STATUS.md'],
  backlog: ['docs/BACKLOG.md', 'BACKLOG.md', 'TODO.md'],
  backlogArchive: ['docs/BACKLOG_ARCHIVE.md', 'BACKLOG_ARCHIVE.md'],
  roadmap: ['docs/ROADMAP.md', 'ROADMAP.md'],
  decisions: ['DECISIONS.md', 'docs/DECISIONS.md'],
  lessons: ['docs/LESSONS.md', 'LESSONS.md'],
  handoff: ['docs/HANDOFF.md', 'HANDOFF.md'],
  handoffArchive: ['docs/HANDOFF_ARCHIVE.md', 'HANDOFF_ARCHIVE.md'],
  maintain: ['docs/MAINTAIN.md', 'MAINTAIN.md'],
};
const md = (title, body) => `# ${title}\n\nKind: Living.\n\n${body}\n`;
export function projectDocuments(a) {
  return {
    [a.status]: md('Project status', `Current state has not been assessed.\n\nRead ${a.handoff} for the next step and ${a.backlog} for outstanding work. Distinguish branch-complete, merged, deployed, and verified. Do not mark the whole project complete from one task's result.`),
    [a.backlog]: md('Backlog', `No work items have been assessed yet.\n\n| ID | Requested outcome | State | Evidence or next step |\n|---|---|---|---|\n\nUse stable IDs; link tasks and decisions. Move completed items into ${a.backlogArchive} with closure date and evidence. A future board reads these records instead of maintaining a second queue.`),
    [a.backlogArchive]: `# Completed backlog\n\nKind: Reference. Current work is in ${a.backlog}.\n\nNo completed items have been recorded. Retain each item's ID, outcome, closure date, and evidence.\n`,
    [a.roadmap]: md('Roadmap', 'No milestones have been agreed yet.\n\n| Milestone | Intended outcome | Backlog IDs | State |\n|---|---|---|---|\n\nRecord agreed priorities. Do not invent dates or commitments.'),
    [a.decisions]: md('Decisions', 'No architectural decisions have been recorded yet.\n\nUse one file per decision in docs/decisions/ with a collision-resistant ID. Record the decision, why, alternatives, risk, reversibility, and evidence. This file is the readable index. Proposed decisions are labelled proposed.'),
    [a.lessons]: md('Lessons', 'No lessons have been recorded yet.\n\nUse one file per lesson in docs/lessons/. Record the symptom, mechanism, correction, future rule, and what enforces it. If nothing enforces it, say so. Company-wide policy changes require a tested, reviewed proposal.'),
    [a.handoff]: md('Handoff', '## RESUME HERE\n\nWritten: not yet assessed\n\n- **State:** Repository records have been provisioned; application readiness is unverified.\n- **Next:** Establish the current task and the actual setup/check commands.\n- **Blocked:** Project-specific requirements and external dependencies have not been assessed.\n- **Watch out:** Security observations start missing. Setup does not establish product correctness.\n\n## Earlier'),
    [a.handoffArchive]: `# Handoff archive\n\nKind: Reference. Current handoff is ${a.handoff}.\n\nNo earlier handoffs have been archived.\n`,
    [a.maintain]: md('Repository maintenance', `Reconcile ${a.status}, ${a.backlog}, ${a.roadmap}, ${a.decisions}, ${a.lessons}, and ${a.handoff} against the conversation and repository evidence. Preserve facts already correct. Capture meaningful decisions during work, not only when ending a session.\n\nSeparate task handoffs belong in docs/tasks/ when work runs concurrently. The shared handoff summarizes the project and points to them. Archive superseded handoffs; keep the current entry bounded. Never copy secrets or private records into these files.`),
    'docs/tasks/README.md': md('Task records', 'Create one Markdown file per task with a unique ID, request, acceptance criteria, current branch, state, decisions, evidence, and next step. Do not overwrite another task. Distinguish local completion from merge and release. No task allocator or generated board is installed in this increment.'),
    'docs/decisions/README.md': md('Decision entries', 'Each decision gets a unique file. Explain choice, reason, alternatives, risk, reversibility, and evidence in plain language. Update the configured decision index. Avoid allocating sequential numbers independently in parallel branches.'),
    'docs/lessons/README.md': md('Lesson entries', 'Each earned lesson gets a unique file. State observed failure, cause, fix, reusable rule, and actual enforcement. Link its regression or say none exists. Keep project-specific evidence here and propose generalized company updates through review.'),
    'docs/security/README.md': md('Security evidence', 'The register is installed by default. Read .skillgate/security/catalog.json and run `node .skillgate/bin/security-evidence.mjs status --dir .`. Missing evidence is normal at setup and requires follow-up; it is never a security pass.\n\nRecord scoped assessments with the runtime record command and redacted evidence files. Sources and artifacts are fingerprinted, not copied. Status reports current, stale, missing, or invalid observations. It does not execute tests, validate the reviewer, certify compliance, or perform penetration testing. Explicitly recorded paths define the freshness coverage.\n\nThe starter catalog is a partial set of original practice summaries related to NIST SSDF 1.1 and one ASVS 5.0.0 requirement. It is not a complete framework assessment. ISO mapping and broader applicability need reviewed scope and permission for any restricted content.\n\nKeep sensitive assessment artifacts in the ignored .skillgate/private-evidence/ directory or an approved evidence store. Never record raw credentials or customer data. Missing private artifacts on another machine remain missing; never replace them with an assumed pass.'),
    '.skillgate/security/records/README.md': md('Observation records', 'The evidence runtime creates immutable UUID-named JSON records here. Preserve history. Do not edit a prior observation to make it current; reassess and record a new one. Review metadata before committing. Keep raw evidence in an approved private location.'),
  };
}

export function projectInstructions(a) {
  return `## Prepared project workflow\n\nThese are instructions, not proof that a hook or required merge gate ran.\n\n- At session start and after compaction, read ${a.handoff}, ${a.status}, and the current task record. Verify their claims against current files and branch state.\n- Use the installed workflow skills when available: dispatch for independent work, maintain for reconciliation, review before a proposed commit. If unavailable, follow ${a.maintain} and report the missing plugin.\n- Record agreed decisions and task checkpoints when they occur; do not wait until the context is full. Preserve unrelated changes.\n- Before review and at session wrap-up, follow ${a.maintain} and run the security status command below. A missing, stale, or invalid observation is a gap to report, not permission to claim a control passes.\n- Before final handoff, update ${a.handoff} with State, Next, Blocked, and Watch out. Keep parallel task handoffs separate.\n- The company's trusted CI and repository settings decide merge eligibility. Never weaken those checks to make a task pass.\n\nSecurity freshness: \`node .skillgate/bin/security-evidence.mjs status --dir . --apply\`. Exit 2 means evidence needs attention; report the gaps and continue authorized work. Exit 1 means the checker could not evaluate the records. Neither means the application is proven insecure. Exit 0 concerns recorded-observation freshness only.\n`;
}

export function maintenanceInstructions() {
  return `## Prepared-project checks\n\n1. Reconcile current task, backlog, status, decisions, lessons, and handoff. Preserve evidence for completed work and archive superseded entries.\n2. Run \`node .skillgate/bin/security-evidence.mjs status --dir . --apply\`. Report the denominator and every missing/stale/invalid observation. Refreshing a report must not re-stamp an assessment.\n3. When actual evidence has been re-read, use the runtime's record command with source paths, redacted artifacts, a reviewer label, and a substantive note. An observed assessment remains a recorded claim.\n4. Read project-specific test results before proposing a commit. This scaffold does not select or enforce application tests. Keep generated setup files and sensitive evidence out of unrelated changes.\n`;
}

const nist = (reference) => ({ framework: 'NIST SSDF', version: '1.1', reference, url: 'https://csrc.nist.gov/pubs/sp/800/218/final', relationship: 'related' });
export const securityCatalog = {
  schemaVersion: 1,
  catalogVersion: 'skillgate-starter-1',
  description: 'Partial original practice summaries. Related references are not equivalence or compliance claims. Applicability requires project review.',
  controls: [
    { id: 'SG-CHECK-CRITERIA', title: 'Define the security checks a change needs', mappings: [nist('PO.4.1')], expectedEvidence: ['Reviewed project criteria and the check definitions that implement them'] },
    { id: 'SG-CHECK-EVIDENCE', title: 'Retain evidence for security decisions', mappings: [nist('PO.4.2')], expectedEvidence: ['A scoped review record linked to its actual execution artifacts'] },
    { id: 'SG-SECURITY-TESTS', title: 'Test security behavior and record findings', mappings: [nist('PW.8.2')], expectedEvidence: ['Results for authorized scoped tests, including denied and legitimate behavior'] },
    { id: 'SG-ROOT-CAUSE', title: 'Explain the mechanism behind a discovered vulnerability', mappings: [nist('RV.3.1')], expectedEvidence: ['Finding with root-cause analysis and linked correction'] },
    { id: 'SG-RECURRING-PATTERNS', title: 'Look for recurring causes across findings', mappings: [nist('RV.3.2')], expectedEvidence: ['Review of related findings and the resulting prevention work'] },
    { id: 'SG-WORKFLOW-IMPROVEMENT', title: 'Turn supported lessons into tested workflow improvements', mappings: [nist('RV.3.4')], expectedEvidence: ['Reviewed prevention change, regression scenario, and release record'] },
    { id: 'SG-COMMAND-INJECTION', title: 'Assess operating-system command construction', mappings: [{ framework: 'OWASP ASVS', version: '5.0.0', reference: 'v5.0.0-1.2.5', url: 'https://github.com/OWASP/ASVS/releases/tag/v5.0.0_release', relationship: 'related' }], expectedEvidence: ['Reviewed command entry points and tests of untrusted input, or a scoped explanation requiring human assessment'] },
  ],
};
