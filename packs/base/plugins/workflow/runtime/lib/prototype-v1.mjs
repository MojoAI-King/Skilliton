// prototype-v1.mjs: what the standalone prototype (layout 1, commit 0bc2a05) wrote into a prepared project, frozen so
// that migration 0002-integrated-layout recognises that content exactly and removes nothing else.
//
// Never edit anything below to make a migration pass. A project whose copied runtime or managed block differs from
// these values may hold local changes, and the migration must refuse it. The test fixtures in
// scripts/fixtures/prototype-v1/ are byte-for-byte copies of the prototype files; scripts/migrate.test.mjs checks
// that these values still agree with them.

export const PROTOTYPE_COMMIT = "0bc2a05";

// Where the prototype's prepare copied its security runtime.
export const PROTOTYPE_RUNTIME_PATH = ".skillgate/bin/security-evidence.mjs";

// sha256 of scripts/security-evidence.mjs at commit 0bc2a05 (the prototype runtime release), computed once from
// scripts/fixtures/prototype-v1/security-evidence.mjs. The prototype copied that file byte for byte, so a copied
// runtime with any other hash was changed after preparation.
export const PROTOTYPE_RUNTIME_SHA256 = "6467f1a0230c687f2448d82b0623c91d9d80f24a33d6a467f6269f5e23807daf";

// The prototype's managed block markers (scripts/prepare.mjs at 0bc2a05, markerStart and markerEnd).
export const PROJECT_MARKER_START = '<!-- skillgate:project:start v1 -->';
export const PROJECT_MARKER_END = '<!-- skillgate:project:end -->';

// How the prototype framed a managed block's content (scripts/prepare.mjs at 0bc2a05, inside managed()).
export function prototypeBlock(content) {
  const markerStart = PROJECT_MARKER_START, markerEnd = PROJECT_MARKER_END;
  return `${markerStart}\n${content.trimEnd()}\n${markerEnd}`;
}

// Exact copies of the prototype renderers (scripts/project-files.mjs at 0bc2a05). projectInstructions(artifacts) was
// the block in CLAUDE.md and AGENTS.md; maintenanceInstructions() was the block in the maintain record.
export function projectInstructions(a) {
  return `## Prepared project workflow\n\nThese are instructions, not proof that a hook or required merge gate ran.\n\n- At session start and after compaction, read ${a.handoff}, ${a.status}, and the current task record. Verify their claims against current files and branch state.\n- Use the installed workflow skills when available: dispatch for independent work, maintain for reconciliation, review before a proposed commit. If unavailable, follow ${a.maintain} and report the missing plugin.\n- Record agreed decisions and task checkpoints when they occur; do not wait until the context is full. Preserve unrelated changes.\n- Before review and at session wrap-up, follow ${a.maintain} and run the security status command below. A missing, stale, or invalid observation is a gap to report, not permission to claim a control passes.\n- Before final handoff, update ${a.handoff} with State, Next, Blocked, and Watch out. Keep parallel task handoffs separate.\n- The company's trusted CI and repository settings decide merge eligibility. Never weaken those checks to make a task pass.\n\nSecurity freshness: \`node .skillgate/bin/security-evidence.mjs status --dir . --apply\`. Exit 2 means evidence needs attention; report the gaps and continue authorized work. Exit 1 means the checker could not evaluate the records. Neither means the application is proven insecure. Exit 0 concerns recorded-observation freshness only.\n`;
}

export function maintenanceInstructions() {
  return `## Prepared-project checks\n\n1. Reconcile current task, backlog, status, decisions, lessons, and handoff. Preserve evidence for completed work and archive superseded entries.\n2. Run \`node .skillgate/bin/security-evidence.mjs status --dir . --apply\`. Report the denominator and every missing/stale/invalid observation. Refreshing a report must not re-stamp an assessment.\n3. When actual evidence has been re-read, use the runtime's record command with source paths, redacted artifacts, a reviewer label, and a substantive note. An observed assessment remains a recorded claim.\n4. Read project-specific test results before proposing a commit. This scaffold does not select or enforce application tests. Keep generated setup files and sensitive evidence out of unrelated changes.\n`;
}
