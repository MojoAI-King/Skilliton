// prepare-plan.mjs: two small planPrepare steps that live here instead of lib/prepare.mjs, which is pinned at its
// own size ceiling (scripts/lint.test.mjs) and had no more room after N67 split planPrepare into named steps
// (docs/tasks/2026-09-23-lane-code-clarity-3584.md). Nothing here imports from outside the plugin folder.

import { refuse } from "./core.mjs";
import { readPath } from "./prepare.mjs";
import { CONFIG_REL } from "./config.mjs";
import { GITIGNORE_LINES, RECORDS_README_REL, SECURITY_README_REL, gitignoreWithSkilliton } from "./project-files.mjs";
import { PROTOTYPE_RUNTIME_PATH } from "./prototype-v1.mjs";

// The .gitignore lines that keep the lock and private evidence out of Git.
export function planGitignoreStep(ctx) {
  const { root, add } = ctx;
  const ignore = readPath(root, ".gitignore");
  const ignoreText = ignore === null ? "" : ignore.toString("latin1");
  const ignoreNext = gitignoreWithSkilliton(ignoreText);
  if (ignore !== null && ignoreNext === ignoreText) { add(".gitignore", "current", `already lists ${GITIGNORE_LINES.join(" and ")}`); return; }
  add(
    ".gitignore", ignore === null ? "create" : "update",
    `${ignore === null ? "lists" : "add"} ${GITIGNORE_LINES.join(" and ")} (the lock and private evidence stay out of Git)`,
    ignore, Buffer.from(ignoreNext, "latin1"),
  );
}

// Refuses two managed paths that collide case-insensitively, then notes any adopted file still pointing at the
// prototype's runtime path.
export function checkPreparePlan(ctx) {
  const { root, project, items, notes } = ctx;
  const seen = new Map();
  for (const item of items) {
    const key = item.path.toLowerCase();
    if (seen.has(key)) {
      refuse(
        `two files prepare manages resolve to the same path, ${item.path} (${seen.get(key)}; ${item.what}). ` +
        `Give them separate paths in ${CONFIG_REL}. Nothing was written`,
      );
    }
    seen.set(key, item.what);
  }
  for (const rel of [SECURITY_README_REL, RECORDS_README_REL, ...["tasks", "decisions", "lessons"].map((k) => `${project.directories[k]}/README.md`)]) {
    const bytes = items.some((i) => i.path === rel && i.action === "adopt") ? readPath(root, rel) : null;
    if (bytes && bytes.includes(PROTOTYPE_RUNTIME_PATH)) {
      notes.push(
        `${rel} still tells people to run ${PROTOTYPE_RUNTIME_PATH}, which layout 2 does not have; replace that text by hand ` +
        `with skilliton security status (prepare never rewrites a file it adopted).`,
      );
    }
  }
}
