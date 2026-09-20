// stack.mjs: what a repository shows about itself, read for prepare (docs/CONTRACTS.md sections 2 and 10).
//
// Two pure readers, no writes and no process exit:
//   detectStack(root)  the test command the repository declares, from its build files, first match wins. Nothing is
//                      run; a malformed file counts as absent, so a broken package.json never stops prepare.
//   hotspots(root)     the paths that recur across recent commits, from git log alone; used to draft
//                      dispatch.hotspots so lanes that touch them are reviewed with care.
// Both say why they found nothing, so the prepare preview can print the reason rather than an empty value.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { GitError, runGit } from "./journal.mjs";

// The detection order, for the help text. Each detector yields the lane command (a string, for
// dispatch.laneTestCommand), the check argv (for a delivery policy check) and the source it was read from.
const DETECTORS = [
  "package.json scripts.test", "package.json scripts.verify", "pytest (pyproject.toml, pytest.ini or conftest.py)",
  "go.mod", "Cargo.toml", "Makefile test target",
];
export const NO_STACK = "no test command was detected (package.json scripts, pytest, go.mod, Cargo.toml, Makefile)";

const readText = (root, rel) => {
  try { return readFileSync(join(root, rel), "utf8"); } catch { return null; }
};

function packageScripts(root) {
  const text = readText(root, "package.json");
  if (text === null) return null;
  try {
    const parsed = JSON.parse(text);
    const scripts = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed.scripts : null;
    return scripts && typeof scripts === "object" && !Array.isArray(scripts) ? scripts : {};
  } catch { return null; }
}

const found = (lane, argv, source) => ({ test: { lane, argv, source }, reason: null });

// { test: { lane, argv, source } | null, reason: string | null }
export function detectStack(root) {
  const scripts = packageScripts(root);
  if (scripts) {
    if (typeof scripts.test === "string" && scripts.test.trim()) return found("npm test", ["npm", "test"], "package.json scripts.test");
    if (typeof scripts.verify === "string" && scripts.verify.trim()) return found("npm run verify", ["npm", "run", "verify"], "package.json scripts.verify");
  }
  const pyproject = readText(root, "pyproject.toml");
  if (pyproject !== null && pyproject.includes("[tool.pytest")) return found("pytest", ["pytest"], "pyproject.toml [tool.pytest]");
  for (const file of ["pytest.ini", "conftest.py"]) {
    if (existsSync(join(root, file))) return found("pytest", ["pytest"], file);
  }
  if (existsSync(join(root, "go.mod"))) return found("go test ./...", ["go", "test", "./..."], "go.mod");
  if (existsSync(join(root, "Cargo.toml"))) return found("cargo test", ["cargo", "test"], "Cargo.toml");
  const makefile = readText(root, "Makefile");
  if (makefile !== null && /^test\s*:/m.test(makefile)) return found("make test", ["make", "test"], "Makefile test target");
  return { test: null, reason: NO_STACK };
}

export const DEFAULT_SKIP = ["docs/", "DECISIONS.md"];
const SEPARATOR = String.fromCharCode(0);

// The paths changed in at least minShare of the last `commits` commits, outside the skip prefixes, most frequent
// first, at most `max`. { paths: string[], commitsSeen: number, reason: string | null }
export function hotspots(root, { commits = 200, minShare = 0.1, max = 5, skip = DEFAULT_SKIP } = {}) {
  let out;
  try {
    out = runGit(root, ["log", "-n", String(commits), "--name-only", "--pretty=format:%x00"]);
  } catch (e) {
    return { paths: [], commitsSeen: 0, reason: e instanceof GitError ? e.message : String(e?.message ?? e) };
  }
  if (out.status !== 0) {
    const first = (out.stderr || "").trim().split("\n")[0];
    const noCommits = /does not have any commits|bad default revision|unknown revision/i.test(first);
    return { paths: [], commitsSeen: 0, reason: noCommits ? "the repository has no commits yet" : `git log did not run (${first || `exit ${out.status}`})` };
  }
  const blocks = out.stdout.split(SEPARATOR);
  const commitsSeen = blocks.length - 1;
  if (commitsSeen <= 0) return { paths: [], commitsSeen: 0, reason: "the repository has no commits yet" };
  const counts = new Map();
  for (const block of blocks.slice(1)) {
    const seen = new Set(block.split("\n").map((l) => l.trim()).filter((l) => l.length));
    for (const path of seen) counts.set(path, (counts.get(path) ?? 0) + 1);
  }
  const threshold = Math.max(1, Math.ceil(minShare * commitsSeen));
  const paths = [...counts.entries()]
    .filter(([path, n]) => n >= threshold && !skip.some((prefix) => path === prefix || path.startsWith(prefix)))
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .slice(0, max)
    .map(([path]) => path);
  return { paths, commitsSeen, reason: paths.length ? null : `no path recurs in at least ${threshold} of the last ${commitsSeen} commit(s)` };
}
