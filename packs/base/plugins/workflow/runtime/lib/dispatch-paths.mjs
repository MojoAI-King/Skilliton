// dispatch-paths.mjs: whether the base commit a lane is made from holds a symbolic link where dispatch writes.
// docs/CONTRACTS.md section 17 (dispatch), and the link rule beside the harness in section 4.
//
// Each lane worktree is checked out from the base commit, so a committed link at the brief, the report or a folder of
// the task record's path would carry that write to wherever it points, outside the repository (reproduced 2026-09-24:
// the brief landed in the file an absolute link named, exit 0). Git records a link with mode 120000; each one found is
// a problem, so the whole run is refused and no lane is half made. Nothing here imports from outside the plugin.

import { BRIEF_FILE, REPORT_FILE } from "./dispatch-brief.mjs";
import { runGit } from "./journal.mjs";

// Problem sentences, one per link found; empty when there is none.
export function linkedLanePaths(root, lane) {
  const parts = lane.taskRel.split("/");
  const paths = [BRIEF_FILE, REPORT_FILE, ...parts.map((_, i) => parts.slice(0, i + 1).join("/"))];
  const r = runGit(root, ["ls-tree", "-z", lane.base, "--", ...paths]);
  if (r.status !== 0) {
    return [`lane ${lane.name}: git ls-tree on its base commit failed (exit ${r.status}), so whether it holds a link where the lane writes is unknown`];
  }
  return r.stdout.split("\0").filter((entry) => entry.startsWith("120000 ")).map((entry) => entry.split("\t")[1])
    .map((path) => `lane ${lane.name}: the base commit holds a symbolic link at ${path}, where dispatch writes in each lane; `
      + "it never writes through a link. Replace it with the file or folder itself");
}
