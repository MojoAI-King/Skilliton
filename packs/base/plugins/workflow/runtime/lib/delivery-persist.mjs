// lib/delivery-persist.mjs: the gate's persistence rule (B61, docs/CONTRACTS.md section 14). A push whose result
// removes a file Skilliton keeps in the project (the .skilliton folder, the record files, the entry folders, and the
// instruction files that carry the managed block) needs an approver-signed commit that removes exactly that file.
// Adding or changing them is free; only a removal is held, because a removal is how a project's memory disappears
// from the shared branch without anyone deciding it. The one sanctioned route is skilliton remove --apply, run by a
// person, in a commit an approver signs.
//
// Where the records live is read from the project's own configuration at the current tip (prepare.artifacts and
// prepare.directories), so a project that moved a record is protected where it put it; every role the configuration
// does not name falls back to its default. A project with no configuration at the tip gets the defaults, which then
// name files it does not have, and a file that does not exist cannot be removed, so nothing is held.
//
// Pure over the git runner the gate already holds; it never reads the working tree, because inside pre-receive there
// is none.

import { DIRECTORY_DEFAULTS, ROLE_CANDIDATES, ROLES } from "./config.mjs";

const INSTRUCTION_FILES = ["CLAUDE.md", "AGENTS.md"];
const PROJECT_FOLDER = ".skilliton";
const CONFIG_PATH = `${PROJECT_FOLDER}/config.json`;
const short = (id) => String(id).slice(0, 12);

// The files and folders Skilliton keeps, given the configuration text at a commit (or null for none).
function keptPaths(configText) {
  let config = null;
  try { config = JSON.parse(configText ?? ""); } catch { config = null; }
  const object = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
  const prepare = object(object(config).prepare);
  const pick = (map, key, fallback) => {
    const v = object(map)[key];
    return typeof v === "string" && v.trim() ? v.trim().replace(/\/+$/, "") : fallback;
  };
  const files = [...INSTRUCTION_FILES, ...ROLES.map((role) => pick(prepare.artifacts, role, ROLE_CANDIDATES[role][0]))];
  const folders = [PROJECT_FOLDER, ...Object.keys(DIRECTORY_DEFAULTS).map((role) => pick(prepare.directories, role, DIRECTORY_DEFAULTS[role]))];
  return { files, folders };
}

const isKept = (path, kept) => kept.files.includes(path) || kept.folders.some((f) => path === f || path.startsWith(`${f}/`));

// Paths present at `from` and absent at `to`.
function deletedPaths(git, from, to) {
  return git(["diff-tree", "-r", "-z", "--no-commit-id", "--name-only", "--diff-filter=D", "--no-renames", from, to]).stdout.split("\0").filter(Boolean);
}

// commits: [{ id, parent }] from the current tip to the pushed tip, each judged against its first parent.
// signatureStatus(id): { state: "verified" | "unverified" | "not-checked", reason? }.
// Returns { reason } when the push is to be rejected, else { notChecked: [...] }.
export function checkRemovals({ git, oldId, newId, commits, signatureStatus }) {
  const config = git(["cat-file", "blob", `${oldId}:${CONFIG_PATH}`], { allowExit: "any" });
  const kept = keptPaths(config.status === 0 ? config.stdout : null);
  const removed = deletedPaths(git, oldId, newId).filter((path) => isKept(path, kept));
  const notChecked = [];
  const route = "The one route that takes Skilliton out of a project is skilliton remove --apply, run by a person, in a commit an approver signs";
  for (const path of removed) {
    // The commit that removes it, judged against its first parent. A removal that no commit in the push makes on its
    // own (a merge resolved by dropping the file) has no commit to sign for it, and is rejected as such.
    const remover = commits.find((c) => c.parent && deletedPaths(git, c.parent, c.id).includes(path));
    if (!remover) return { reason: `the pushed result removes ${path}, which Skilliton keeps in this project, and no commit in the push removes it on its own (a merge dropped it). ${route}` };
    const sig = signatureStatus(remover.id);
    if (sig.state === "unverified") return { reason: `commit ${short(remover.id)} removes ${path}, which Skilliton keeps in this project, without an approver signature: ${sig.reason}. ${route}` };
    if (sig.state === "not-checked") notChecked.push(`commit ${short(remover.id)} removes ${path}, which Skilliton keeps in this project, and needs an approver signature`);
  }
  return { notChecked };
}
