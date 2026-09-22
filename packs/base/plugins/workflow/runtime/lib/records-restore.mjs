// lib/records-restore.mjs: what the session-start block and status say when a record, or the whole configuration,
// is missing from the working tree (B61). A tracked file that is gone was removed by hand; one that is not tracked
// was never made. The line names which and the command that brings it back, and nothing here restores anything:
// restoring silently would hide a person's decision, and a person deleting in Finder or a terminal is outside every
// hook, so naming it at the next session start is the only place it can be seen.

import { runGit } from "./journal.mjs";
import { selfCommand } from "./core.mjs";

const listOf = (items) => (items.length <= 2 ? items.join(" and ") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);

// Tracked files among `paths` that are missing from the working tree, or null when Git could not say.
export function deletedTracked(root, paths) {
  try {
    const r = runGit(root, ["ls-files", "-z", "--deleted", "--", ...paths]);
    return r.status === 0 ? r.stdout.split("\0").filter(Boolean) : null;
  } catch { return null; }
}

// A missing record was removed by hand (it is tracked) or never made (it is not): the line says which and names the
// command that brings it back, and restores nothing itself (B61).
export function restoreAdvice(root, paths, data) {
  const deleted = deletedTracked(root, paths);
  if (deleted === null) { data.removed = null; return "whether Git tracks them could not be read"; }
  const removed = paths.filter((p) => deleted.includes(p));   // in the roles' order, not git's
  const never = paths.filter((p) => !deleted.includes(p));
  data.removed = removed;
  data.never = never;
  const one = (list) => list.length === 1;
  const parts = [];
  if (removed.length) parts.push(`${listOf(removed)} ${one(removed) ? "is" : "are"} tracked in Git and missing from the working tree, so ${one(removed) ? "it was" : "they were"} removed here by hand; restore ${one(removed) ? "it" : "them"} with: git checkout -- ${removed.join(" ")}`);
  if (never.length) parts.push(`${listOf(never)} ${one(never) ? "is" : "are"} not in Git; ${selfCommand()} prepare --apply recreates ${one(never) ? "it" : "them"} and leaves every record that exists as it is`);
  return parts.join("; ");
}

