// migrations-findings.mjs: migration 0004-security-findings-file (backlog B78). Security findings used to be a
// generated section of the backlog record; they now live in their own file (security.findingsFile in
// .skilliton/config.json, default docs/SECURITY_FINDINGS.md) and the backlog keeps, between the same two marker lines,
// one line: a link to that file with the count of open findings. lib/security.mjs writes both from now on; this
// migration moves a section an earlier release wrote, with a receipt like every other migration.
//
// It moves the section as it stands, byte for byte apart from its heading and line endings, rather than recomputing it
// from the security register: a migration changes the layout of what is there, and the next `security findings --apply`
// (or `maintain --apply`) regenerates it. It is idempotent: a backlog with no old section (none at all, or already the
// one-line link) plans no file change. A findings file that already holds a generated section is newer than the
// backlog's, so it is kept and only the backlog is changed. Text outside the markers is never changed in either file.
//
// Registered by one line at the end of MIGRATIONS in lib/migrations.mjs. It does not change prepare.version, so it is
// a same-layout migration, like the instructions refresh: the entry carries `needed(project)` for the state pass that
// lists a same-layout migration as pending (see the lane report for the two lines that pass needs).
//
// Nothing here parses arguments, prints, or exits. Refusals are Refused (core.mjs), as every migration's are.

import { refuse } from "./core.mjs";
import { LAYOUT_VERSION } from "./config.mjs";
import {
  FINDINGS_END, FINDINGS_START, LIMIT, SecurityRefusal, findingsFileRel, inspectPath, newBudget, newFindingsFile, readRepositoryFile, refusalText,
  renderBacklogLink, upsertFindings,
} from "./security.mjs";

const ID = "0004-security-findings-file";
const OLD_HEADING = "## Security findings";

// A security refusal (a link, an unsafe path, a malformed marker) as the migration refusal the migrate command prints.
function asRefused(e, what) {
  if (!(e instanceof SecurityRefusal)) throw e;
  refuse(`migration ${ID} refused: ${what}: ${refusalText(e.code)}${e.detail ? ` (${e.detail})` : ""}. Nothing was changed`);
}

// { exists, bytes, text } for a managed file, read through the security file layer (no link is followed).
function readManaged(root, rel) {
  try {
    if (!inspectPath(root, rel)) return { exists: false, bytes: null, text: "" };
    const { buffer } = readRepositoryFile(root, rel, newBudget(), LIMIT.backlog);
    return { exists: true, bytes: buffer, text: buffer.toString("latin1") };
  } catch (e) { return asRefused(e, rel); }
}

// The inner lines of the backlog's old findings section, or null when it holds none: no markers, or the markers
// around the one-line link this release writes. text is latin1; the lines come back as ordinary (UTF-8) text.
function oldFindingsSection(text) {
  const start = text.indexOf(FINDINGS_START), end = text.indexOf(FINDINGS_END);
  if (start < 0 || end < start) return null;
  const raw = Buffer.from(text.slice(start + FINDINGS_START.length, end), "latin1");
  const decoded = raw.toString("utf8");
  const lines = decoded.split(/\r?\n/).slice(1, -1);
  if (!lines.includes(OLD_HEADING)) return null;
  if (!Buffer.from(decoded, "utf8").equals(raw)) {
    refuse(`migration ${ID} refused: the security findings section of the backlog record is not UTF-8 text, so it cannot be moved `
      + "unchanged. Nothing was changed. Regenerate it instead: security findings --apply");
  }
  return lines;
}

// The moved section as the findings file holds it: the old heading becomes the one the writer uses now.
const movedBlock = (lines) => [FINDINGS_START, ...lines.map((l) => (l === OLD_HEADING ? "## Open findings" : l)), FINDINGS_END].join("\n");
const openCount = (lines) => lines.filter((l) => l.startsWith("| SEC-")).length;

async function planFindingsFile(project, { root }) {
  const backlogRel = project.artifacts.backlog;
  let rel;
  try { rel = findingsFileRel(project); } catch (e) { asRefused(e, "the findings file"); }
  const backlog = readManaged(root, backlogRel);
  const lines = backlog.exists ? oldFindingsSection(backlog.text) : null;
  if (!lines) return { files: [], notes: [`${backlogRel} holds no generated security findings section, so there is nothing to move.`] };
  const file = readManaged(root, rel);
  const files = [], notes = [];
  try {
    if (file.exists && file.text.includes(FINDINGS_START)) {
      notes.push(`${rel} already holds a generated findings section, newer than the backlog's; it is kept, and only the backlog changes.`);
    } else {
      const after = file.exists ? upsertFindings(file.text, movedBlock(lines)) : newFindingsFile(project, movedBlock(lines));
      const what = "the security findings section, moved from the backlog record";
      files.push({ path: rel, action: file.exists ? "update" : "create", before: file.bytes, after: Buffer.from(after, "latin1"), what, diff: true });
    }
    const next = upsertFindings(backlog.text, renderBacklogLink(backlogRel, rel, openCount(lines)));
    const what = `the findings section replaced by one line linking ${rel}`;
    files.push({ path: backlogRel, action: "update", before: backlog.bytes, after: Buffer.from(next, "latin1"), what, diff: true });
  } catch (e) { asRefused(e, backlogRel); }
  notes.push("The section moves as it stood; run security findings --apply afterwards to regenerate it from the current evidence.");
  return { files, notes };
}

// Whether a project still holds the old section: what a same-layout state pass asks before listing this as pending.
function needed(project) {
  const backlog = readManaged(project.root, project.artifacts.backlog);
  return backlog.exists && oldFindingsSection(backlog.text) !== null;
}

export const FINDINGS_MIGRATIONS = [
  {
    id: ID,
    kind: "content",
    from: LAYOUT_VERSION,
    to: LAYOUT_VERSION,
    summary: "move the generated security findings section out of the backlog record into its own file (security.findingsFile, "
      + "default docs/SECURITY_FINDINGS.md), leaving one line that links it with the count of open findings",
    plan: planFindingsFile,
    needed,
    paths: (project) => [project.artifacts.backlog, findingsFileRel(project)],
  },
];
